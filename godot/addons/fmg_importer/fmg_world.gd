@tool
class_name FMGWorld
extends Node3D
## The root of an imported world, with lookups by position for the game's code.

@export var data: FMGWorldData


func meters_per_pixel() -> float:
	return float(data.world.get("metersPerPixel", 1.0))


## The biome under a position: { id, name, color, habitability }
func biome_at(position: Vector3) -> Dictionary:
	var map := data.biome_map
	var spacing := meters_per_pixel()
	var x := clampi(roundi(position.x / spacing), 0, map.get_width() - 1)
	var y := clampi(roundi(position.z / spacing), 0, map.get_height() - 1)
	var id := map.get_pixel(x, y).r8
	for biome: Dictionary in data.world.get("biomes", []):
		if int(biome.id) == id:
			return biome
	return {}


## Species that live in the biome under a position
func species_at(position: Vector3) -> Array:
	var biome := biome_at(position)
	if biome.is_empty():
		return []
	return data.fauna_flora.get("species", []).filter(
		func(species: Dictionary) -> bool: return species.biomes.any(func(id) -> bool: return int(id) == int(biome.id))
	)


## The state, province, culture or religion (kind: "states", "provinces"...) covering a position
func area_at(kind: String, position: Vector3) -> Dictionary:
	var point := Vector2(position.x, position.z)
	for area: Dictionary in data.political.get(kind, []):
		for ring: Array in area.get("polygons", []):
			var polygon := PackedVector2Array()
			for vertex: Array in ring:
				polygon.append(Vector2(vertex[0], vertex[1]))
			if Geometry2D.is_point_in_polygon(point, polygon):
				return area
	return {}


func state_at(position: Vector3) -> Dictionary:
	return area_at("states", position)


## A burg or marker by name
func place(name: String) -> Dictionary:
	for kind in ["burgs", "markers"]:
		for item: Dictionary in data.places.get(kind, []):
			if item.get("name") == name:
				return item
	return {}


func emblem(kind: String, id: int) -> Texture2D:
	return data.emblems.get("%s_%d" % [kind, id])
