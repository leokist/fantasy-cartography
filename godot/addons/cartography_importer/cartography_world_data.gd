@tool
class_name CartographyWorldData
extends Resource
## Everything a Fantasy Cartography package says about the world, kept for the game's code.

@export var world: Dictionary ## world.json: size, meters per pixel, heights, biomes
@export var places: Dictionary ## burgs and markers, positions in meters
@export var political: Dictionary ## states and provinces, polygons on the XZ plane
@export var fauna_flora: Dictionary ## biomes and species
@export var rivers: Array
@export var roads: Array
@export var lakes: Array
@export var biome_map: Image ## one biome id per terrain pixel
@export var emblems: Dictionary ## "state_1", "province_4", "burg_12" -> Texture2D
