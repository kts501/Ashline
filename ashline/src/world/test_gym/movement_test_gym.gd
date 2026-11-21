extends Node3D
## Stage 1 Movement Test Gym setup & lightweight HUD signal binding.

@onready var hud_label: Label = $DebugOverlay/StatsLabel

var _state: StringName = &"IDLE"
var _stamina: float = 100.0
var _stamina_max: float = 100.0
var _exhausted: bool = false


func _ready() -> void:
	EventBus.player_state_changed.connect(_on_state_changed)
	EventBus.stamina_changed.connect(_on_stamina_changed)
	_refresh_label()


func _process(_delta: float) -> void:
	_refresh_label()


func _on_state_changed(_prev: StringName, next_state: StringName) -> void:
	_state = next_state


func _on_stamina_changed(current: float, maximum: float, is_exhausted: bool) -> void:
	_stamina = current
	_stamina_max = maximum
	_exhausted = is_exhausted


func _refresh_label() -> void:
	if hud_label == null:
		return
	var fps := Engine.get_frames_per_second()
	var exhaust_str := " [EXHAUSTED]" if _exhausted else ""
	hud_label.text = "ASHLINE // STAGE 1 GYM\nSTATE: %s\nSTAMINA: %d / %d%s\nFPS: %d" % [
		_state,
		int(roundf(_stamina)),
		int(roundf(_stamina_max)),
		exhaust_str,
		fps
	]
