@tool
class_name FMGImporter
extends RefCounted
## Builds a Terrain3D world scene from a Fantasy Cartography Godot package (.zip or unzipped folder).
##
## var scene_path := FMGImporter.new().import_package("C:/maps/aldoria-godot.zip")

const World := preload("fmg_world.gd")
const WorldData := preload("fmg_world_data.gd")
const FORMAT := "fmg-godot"
const MAX_TEXTURES := 32
const TEXTURE_SIZE := 256

## Labels over burgs and markers
var place_labels := true
## Ribbon meshes along roads; the terrain already shows them with the road texture
var road_meshes := false
var water_material: Material
var road_color := Color(0.45, 0.36, 0.25)
var riverbed_color := Color(0.33, 0.3, 0.24)


## Unpacks and builds the world, saving the scene, terrain data and world data under target_root.
## Returns the scene path, or "" when the package cannot be read.
func import_package(source: String, target_root := "res://fmg") -> String:
	var package_dir := source
	if source.get_extension().to_lower() == "zip":
		var packages := target_root.path_join("_packages")
		package_dir = _unzip(source, packages.path_join(source.get_file().get_basename()))
		_touch(packages.path_join(".gdignore")) # raw files stay out of the editor's import
	var world := _json(package_dir, "world.json")
	if world.get("format") != FORMAT:
		push_error("FMG Importer: %s is not a Fantasy Cartography Godot package" % source)
		return ""

	var slug := _slug(str(world.get("name", "")))
	if slug.is_empty():
		slug = _slug(package_dir.get_file())
	var out_dir := target_root.path_join(slug)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))

	var root := build_world(package_dir, out_dir)
	root.name = slug
	var scene := PackedScene.new()
	var error := scene.pack(root)
	var path := out_dir.path_join(slug + ".tscn")
	if error == OK:
		error = ResourceSaver.save(scene, path)
	root.free()
	if error != OK:
		push_error("FMG Importer: cannot save %s (%s)" % [path, error_string(error)])
		return ""
	print("FMG Importer: world saved to ", path)
	return path


## The world as a node tree; terrain data and world data are saved into out_dir.
func build_world(package_dir: String, out_dir: String) -> Node3D:
	var world := _json(package_dir, "world.json")
	var root: Node3D = World.new()
	root.name = "World"
	root.data = _world_data(package_dir, world, out_dir)
	var host := (Engine.get_main_loop() as SceneTree).root
	host.add_child(root) # Terrain3D sets itself up only inside a tree

	_own(_terrain(root, package_dir, world, out_dir), root)
	_add(root, root, _sea(world))
	_add(root, root, _lakes(root.data.lakes))
	_add(root, root, _rivers(root.data.rivers))
	_add(root, root, _roads(root.data.roads))
	var size: Array = world.size
	var extent := maxf(float(size[0]), float(size[1])) * float(world.metersPerPixel)
	_add(root, root, _places("Burgs", root.data.places.get("burgs", []), extent))
	_add(root, root, _places("Markers", root.data.places.get("markers", []), extent))
	host.remove_child(root)
	return root


func _world_data(package_dir: String, world: Dictionary, out_dir: String) -> Resource:
	var data: Resource = WorldData.new()
	data.world = world
	data.places = _json(package_dir, "places.json")
	data.political = _json(package_dir, "political.json")
	data.fauna_flora = _json(package_dir, "fauna_flora.json")
	data.rivers = _json_array(package_dir, "rivers.json")
	data.roads = _json_array(package_dir, "roads.json")
	data.lakes = _json_array(package_dir, "lakes.json")
	data.biome_map = Image.load_from_file(package_dir.path_join("biomes.png"))
	data.biome_map.convert(Image.FORMAT_L8)

	var emblems := {}
	var owners: Array = data.political.get("states", []) + data.political.get("provinces", []) + data.places.get("burgs", [])
	for owner: Dictionary in owners:
		var file = owner.get("emblem")
		if file == null or not FileAccess.file_exists(package_dir.path_join(file)):
			continue
		var image := Image.load_from_file(package_dir.path_join(file))
		emblems[str(file).get_file().get_basename()] = ImageTexture.create_from_image(image)
	data.emblems = emblems

	_save(data, out_dir.path_join("world_data.res"))
	return data


# Heights in meters, one texture slot per biome tinted with its color, roads as an overlay texture
func _terrain(parent: Node, package_dir: String, world: Dictionary, out_dir: String) -> Node3D:
	var size: Array = world.size
	var largest := maxi(int(size[0]), int(size[1]))
	var region_size := 256
	while region_size < 2048 and largest > region_size * 16:
		region_size *= 2

	var terrain := Terrain3D.new()
	terrain.name = "Terrain3D"
	terrain.free_editor_textures = false # quiet until its assets are saved
	parent.add_child(terrain)
	terrain.assets = _assets(world, out_dir)
	terrain.free_editor_textures = true
	terrain.material.set_shader_param("blend_sharpness", 0.15) # soft fades between biomes
	terrain.change_region_size(region_size)
	terrain.vertex_spacing = float(world.metersPerPixel)

	var height := Image.load_from_file(package_dir.path_join("heightmap.exr"))
	height.convert(Image.FORMAT_RF)
	var images: Array[Image] = [height, _control_map(package_dir, world), null]
	terrain.data.import_images(images, Vector3.ZERO, 0.0, 1.0)

	var data_dir := out_dir.path_join("terrain")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(data_dir))
	terrain.data_directory = data_dir
	terrain.data.save_directory(data_dir)
	return terrain


func _texture_slots(world: Dictionary) -> Dictionary:
	var biomes: Array = world.get("biomes", [])
	var slots := {}
	for biome: Dictionary in biomes:
		if slots.size() < MAX_TEXTURES - 2:
			slots[int(biome.id)] = slots.size()
	return {"biomes": slots, "road": slots.size(), "riverbed": slots.size() + 1}


func _assets(world: Dictionary, out_dir: String) -> Resource:
	var slots := _texture_slots(world)
	# plain textures tinted per slot; drop real ones into the slots later
	var albedo := _flat_texture(Color(1, 1, 1, 0.5), out_dir.path_join("flat_albedo.res")) # alpha: blend height
	var normal := _flat_texture(Color(0.5, 0.5, 1, 0.5), out_dir.path_join("flat_normal.res")) # alpha: roughness
	var colors := {}
	for biome: Dictionary in world.get("biomes", []):
		colors[slots.biomes.get(int(biome.id), -1)] = Color(str(biome.color))
	colors[slots.road] = road_color
	colors[slots.riverbed] = riverbed_color

	var assets := Terrain3DAssets.new()
	for biome: Dictionary in world.get("biomes", []):
		var id: int = slots.biomes.get(int(biome.id), -1)
		if id >= 0:
			assets.set_texture_asset(id, _texture_asset(id, str(biome.name), colors[id], albedo, normal))
	assets.set_texture_asset(slots.road, _texture_asset(slots.road, "Road", road_color, albedo, normal))
	assets.set_texture_asset(slots.riverbed, _texture_asset(slots.riverbed, "Riverbed", riverbed_color, albedo, normal))
	_save(assets, out_dir.path_join("terrain_assets.res"))
	return assets


func _flat_texture(color: Color, path: String) -> Texture2D:
	var image := Image.create(TEXTURE_SIZE, TEXTURE_SIZE, false, Image.FORMAT_RGBA8)
	image.fill(color)
	image.generate_mipmaps()
	var texture := ImageTexture.create_from_image(image)
	_save(texture, path)
	return texture


func _texture_asset(id: int, asset_name: String, color: Color, albedo: Texture2D, normal: Texture2D) -> Terrain3DTextureAsset:
	var asset := Terrain3DTextureAsset.new()
	asset.name = asset_name
	asset.id = id
	asset.albedo_color = color
	asset.albedo_texture = albedo
	asset.normal_texture = normal
	return asset


# a resource of its own file, so scenes link it instead of embedding it
func _save(resource: Resource, path: String) -> void:
	var error := ResourceSaver.save(resource, path, ResourceSaver.FLAG_COMPRESS)
	if error != OK:
		push_error("FMG Importer: cannot save %s (%s)" % [path, error_string(error)])
	resource.take_over_path(path)


# Terrain3D's control map: base texture per biome; the overlay is the riverbed or road where their masks are,
# elsewhere the neighbouring biome, so biomes fade into each other at their borders
func _control_map(package_dir: String, world: Dictionary) -> Image:
	var slots := _texture_slots(world)
	var biomes := Image.load_from_file(package_dir.path_join("biomes.png"))
	var roads := Image.load_from_file(package_dir.path_join("masks/roads.png"))
	var rivers := Image.load_from_file(package_dir.path_join("masks/rivers.png"))
	for image in [biomes, roads, rivers]:
		image.convert(Image.FORMAT_L8)
	var width := biomes.get_width()
	var height := biomes.get_height()

	var blend_path := package_dir.path_join("biome_blend.png")
	var blend := Image.load_from_file(blend_path) if FileAccess.file_exists(blend_path) else Image.create(width, height, false, Image.FORMAT_RGB8)
	blend.convert(Image.FORMAT_RGB8)

	var base := PackedInt64Array()
	var overlay := PackedInt64Array()
	base.resize(256)
	overlay.resize(256)
	for i in 256:
		var slot := int(slots.biomes.get(i, 0)) & 0x1F
		base[i] = slot << 27
		overlay[i] = slot << 22
	var road_bits := (int(slots.road) & 0x1F) << 22
	var riverbed_bits := (int(slots.riverbed) & 0x1F) << 22

	var biome_bytes := biomes.get_data()
	var road_bytes := roads.get_data()
	var river_bytes := rivers.get_data()
	var blend_bytes := blend.get_data()
	var bytes := PackedByteArray()
	bytes.resize(width * height * 4)
	for i in width * height:
		var bits := base[biome_bytes[i]]
		var river := river_bytes[i]
		var road := road_bytes[i]
		if river > road:
			bits |= riverbed_bits | (river << 14)
		elif road > 0:
			bits |= road_bits | (road << 14)
		else:
			var share := blend_bytes[i * 3 + 1]
			if share > 0:
				bits |= overlay[blend_bytes[i * 3]] | (share << 14)
		bytes.encode_u32(i * 4, bits)
	return Image.create_from_data(width, height, false, Image.FORMAT_RF, bytes)


func _sea(world: Dictionary) -> Node3D:
	var size: Array = world.size
	var spacing := float(world.metersPerPixel)
	var extent := Vector2(float(size[0]) * spacing, float(size[1]) * spacing)
	var plane := PlaneMesh.new()
	plane.size = extent
	var sea := MeshInstance3D.new()
	sea.name = "Sea"
	sea.mesh = plane
	sea.material_override = _water()
	sea.position = Vector3(extent.x / 2, float(world.get("seaLevel", 0.0)), extent.y / 2)
	return sea


func _lakes(lakes: Array) -> Node3D:
	var group := Node3D.new()
	group.name = "Lakes"
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var count := 0
	for lake: Dictionary in lakes:
		var polygon := PackedVector2Array()
		for vertex: Array in lake.ring:
			polygon.append(Vector2(vertex[0], vertex[1]))
		var triangles := Geometry2D.triangulate_polygon(polygon)
		for index in triangles:
			surface.set_normal(Vector3.UP)
			surface.add_vertex(Vector3(polygon[index].x, float(lake.surface), polygon[index].y))
		count += triangles.size()
	if count:
		var mesh := MeshInstance3D.new()
		mesh.name = "LakeWater"
		mesh.mesh = surface.commit()
		mesh.material_override = _water()
		group.add_child(mesh)
	return group


func _rivers(rivers: Array) -> Node3D:
	var group := Node3D.new()
	group.name = "Rivers"
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for river: Dictionary in rivers:
		_ribbon(surface, river.points, river.widths, 0.05)
		group.add_child(_path(str(river.get("name", "River")), river.points, river))
	var mesh := MeshInstance3D.new()
	mesh.name = "RiverWater"
	mesh.mesh = surface.commit()
	mesh.material_override = _water()
	group.add_child(mesh)
	return group


func _roads(roads: Array) -> Node3D:
	var group := Node3D.new()
	group.name = "Roads"
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for road: Dictionary in roads:
		var widths := []
		widths.resize(road.points.size())
		widths.fill(float(road.width))
		if road_meshes:
			_ribbon(surface, road.points, widths, 0.1)
		group.add_child(_path(str(road.get("name", road.get("group", "Road"))), road.points, road))
	if road_meshes:
		var mesh := MeshInstance3D.new()
		mesh.name = "RoadSurface"
		mesh.mesh = surface.commit()
		var material := StandardMaterial3D.new()
		material.albedo_color = road_color
		mesh.material_override = material
		group.add_child(mesh)
	return group


# labels fade out with distance, capitals stay readable from further away
func _places(group_name: String, places: Array, extent: float) -> Node3D:
	var group := Node3D.new()
	group.name = group_name
	for place: Dictionary in places:
		var marker := Marker3D.new()
		marker.name = _node_name(str(place.get("name", place.get("kind", "Place"))))
		marker.position = _vector(place.position)
		marker.set_meta("fmg", place)
		if place_labels:
			var label := Label3D.new()
			label.name = "Label"
			label.text = str(place.get("name", ""))
			label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			var capital: bool = place.get("capital", false)
			label.fixed_size = true
			label.pixel_size = 0.0008 if capital else 0.0005
			label.position = Vector3.UP * 4
			label.visibility_range_end = extent * (0.5 if capital else 0.12)
			marker.add_child(label)
		group.add_child(marker)
	return group


func _path(path_name: String, points: Array, meta: Dictionary) -> Path3D:
	var curve := Curve3D.new()
	for point: Array in points:
		curve.add_point(_vector(point))
	var path := Path3D.new()
	path.name = _node_name(path_name)
	path.curve = curve
	var info := meta.duplicate()
	info.erase("points")
	path.set_meta("fmg", info)
	return path


# a flat strip along the points, the given width at each point
func _ribbon(surface: SurfaceTool, points: Array, widths: Array, lift: float) -> void:
	var count := points.size()
	if count < 2:
		return
	var left := PackedVector3Array()
	var right := PackedVector3Array()
	for i in count:
		var previous := _vector(points[maxi(i - 1, 0)])
		var next := _vector(points[mini(i + 1, count - 1)])
		var direction := Vector3(next.x - previous.x, 0, next.z - previous.z).normalized()
		var side := Vector3(-direction.z, 0, direction.x) * float(widths[i]) * 0.5
		var center := _vector(points[i]) + Vector3.UP * lift
		left.append(center + side)
		right.append(center - side)
	for i in count - 1:
		for vertex in [left[i], left[i + 1], right[i], right[i], left[i + 1], right[i + 1]]:
			surface.set_normal(Vector3.UP)
			surface.add_vertex(vertex)


func _water() -> Material:
	if water_material:
		return water_material
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.16, 0.36, 0.55, 0.78)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.roughness = 0.08
	material.metallic_specular = 0.8
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	water_material = material
	return material


func _add(root: Node, parent: Node, child: Node) -> void:
	parent.add_child(child)
	_own(child, root)


func _own(node: Node, root: Node) -> void:
	node.owner = root
	if node is Terrain3D:
		return # its own children are rebuilt at runtime
	for child in node.get_children():
		_own(child, root)


func _vector(values: Array) -> Vector3:
	return Vector3(float(values[0]), float(values[1]), float(values[2]))


func _node_name(text: String) -> String:
	var clean := text.validate_node_name().strip_edges()
	return clean if not clean.is_empty() else "Unnamed"


func _slug(text: String) -> String:
	var slug := ""
	for character in text.to_lower():
		slug += character if character.is_valid_identifier() or character.is_valid_int() else "_"
	return slug.strip_edges().trim_prefix("_").trim_suffix("_")


func _json(dir: String, file: String) -> Dictionary:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join(file)))
	return parsed if parsed is Dictionary else {}


func _json_array(dir: String, file: String) -> Array:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join(file)))
	return parsed if parsed is Array else []


func _touch(path: String) -> void:
	if not FileAccess.file_exists(path):
		FileAccess.open(path, FileAccess.WRITE).close()


# unzips into a folder, dropping the package's own top folder
func _unzip(zip_path: String, into: String) -> String:
	var reader := ZIPReader.new()
	if reader.open(zip_path) != OK:
		push_error("FMG Importer: cannot open " + zip_path)
		return ""
	var files := reader.get_files()
	var prefix := ""
	if files.size() and files[0].contains("/"):
		prefix = files[0].get_slice("/", 0) + "/"
		for file in files:
			if not file.begins_with(prefix):
				prefix = ""
				break
	for file in files:
		if file.ends_with("/"):
			continue
		var target := into.path_join(file.trim_prefix(prefix))
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(target.get_base_dir()))
		var out := FileAccess.open(target, FileAccess.WRITE)
		out.store_buffer(reader.read_file(file))
		out.close()
	reader.close()
	return into
