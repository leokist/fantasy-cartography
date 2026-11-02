extends SceneTree
## Imports a package and checks the world it builds:
## godot --headless --path godot --script tests/test_import.gd -- path/to/package.zip

const Importer := preload("res://addons/cartography_importer/cartography_importer.gd")

var _failures := 0


func _initialize() -> void:
	process_frame.connect(_run, CONNECT_ONE_SHOT) # the root joins the tree with the first frame


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Pass the package path after --")
		quit(2)
		return
	var scene_path := Importer.new().import_package(args[0], "res://cartography")
	_check(not scene_path.is_empty(), "scene saved")
	if scene_path.is_empty():
		quit(1)
		return

	var world: Node3D = load(scene_path).instantiate()
	root.add_child(world)
	var terrain: Terrain3D = world.get_node("Terrain3D")
	var data: Resource = world.data
	var spacing := float(data.world.metersPerPixel)
	_check(terrain.data.get_region_count() > 0, "terrain regions loaded from disk")
	_check(is_equal_approx(terrain.vertex_spacing, spacing), "vertex spacing is meters per pixel")

	var off := 0.0
	var burgs: Array = data.places.burgs
	for burg: Dictionary in burgs:
		var position := Vector3(burg.position[0], 0, burg.position[2])
		off = maxf(off, absf(terrain.data.get_surface_height(position) - float(burg.position[1])))
	_check(burgs.size() > 0 and off < 1.0, "burgs stand on the terrain (worst %.2f m)" % off)

	var above := 0
	var checked := 0
	for river: Dictionary in data.rivers:
		for point: Array in river.points:
			checked += 1
			if terrain.data.get_height(Vector3(point[0], 0, point[2])) > float(point[1]) + 0.5:
				above += 1
	_check(checked > 0 and above < checked * 0.02, "river water above its bed (%d of %d points dry)" % [above, checked])

	var rivers: Node = world.get_node("Rivers")
	_check(rivers.get_child_count() == data.rivers.size() + 1, "a Path3D per river plus the water mesh")
	_check(world.get_node("Roads").get_child_count() == data.roads.size(), "a Path3D per road")
	_check(world.get_node("Burgs").get_child_count() == burgs.size(), "a Marker3D per burg")
	var control := terrain.data.get_control(Vector3(burgs[0].position[0], 0, burgs[0].position[2]))
	_check(control != 0, "the control map is painted")

	var sample: Dictionary = burgs[0]
	var at := Vector3(sample.position[0], sample.position[1], sample.position[2])
	_check(not world.biome_at(at).is_empty(), "biome lookup")
	_check(not world.state_at(at).is_empty() or int(sample.get("state", 0)) == 0, "state lookup")
	var emblem_files: Array = data.political.states.filter(func(state: Dictionary) -> bool: return state.get("emblem") != null)
	_check(data.emblems.size() >= emblem_files.size(), "emblems kept as textures (%d)" % data.emblems.size())

	print("Biome at %s: %s, %d species" % [sample.name, world.biome_at(at).name, world.species_at(at).size()])

	print("FAILURES: ", _failures)
	quit(1 if _failures else 0)


func _check(ok: bool, what: String) -> void:
	print(("PASS " if ok else "FAIL ") + what)
	if not ok:
		_failures += 1
