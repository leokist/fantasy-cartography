@tool
extends EditorPlugin

const MENU := "Import Fantasy Cartography package..."
const Importer := preload("cartography_importer.gd")

var _dialog: EditorFileDialog


func _enter_tree() -> void:
	add_tool_menu_item(MENU, _open_dialog)


func _exit_tree() -> void:
	remove_tool_menu_item(MENU)
	if _dialog:
		_dialog.queue_free()


func _open_dialog() -> void:
	if not _dialog:
		_dialog = EditorFileDialog.new()
		_dialog.title = "Choose a Godot package (.zip) or its unzipped folder"
		_dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_ANY
		_dialog.access = EditorFileDialog.ACCESS_FILESYSTEM
		_dialog.add_filter("*.zip", "Fantasy Cartography Godot package")
		_dialog.file_selected.connect(_import)
		_dialog.dir_selected.connect(_import)
		EditorInterface.get_base_control().add_child(_dialog)
	_dialog.popup_file_dialog()


func _import(path: String) -> void:
	var scene_path := Importer.new().import_package(path)
	if scene_path.is_empty():
		return
	EditorInterface.get_resource_filesystem().scan()
	EditorInterface.open_scene_from_path(scene_path)
