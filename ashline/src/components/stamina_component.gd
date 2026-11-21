class_name StaminaComponent
extends Node
## Self-contained stamina resource pool with regen delay and exhaustion lockout.

signal stamina_updated(current: float, maximum: float, is_exhausted: bool)
signal exhaustion_changed(is_exhausted: bool)

@export var tuning: MovementTuning

var current_stamina: float = 100.0
var is_exhausted: bool = false
var _regen_delay_timer: float = 0.0
var _drained_this_frame: bool = false


func _ready() -> void:
	if tuning != null:
		current_stamina = tuning.stamina_max
	_emit_state()


func can_sprint() -> bool:
	return not is_exhausted and current_stamina > 0.5


func can_jump() -> bool:
	return not is_exhausted and current_stamina >= 1.0


func consume_continuous(amount_per_sec: float, delta: float) -> void:
	if tuning == null or delta <= 0.0:
		return
	_drained_this_frame = true
	_regen_delay_timer = tuning.stamina_regen_delay
	current_stamina = maxf(0.0, current_stamina - amount_per_sec * delta)
	if current_stamina <= 0.0 and not is_exhausted:
		is_exhausted = true
		exhaustion_changed.emit(true)
		EventBus.player_exhausted_changed.emit(true)
	_emit_state()


func try_consume_instant(cost: float) -> bool:
	if tuning == null or is_exhausted:
		return false
	if current_stamina < 1.0:
		return false
	_drained_this_frame = true
	_regen_delay_timer = tuning.stamina_regen_delay
	current_stamina = maxf(0.0, current_stamina - cost)
	if current_stamina <= 0.0 and not is_exhausted:
		is_exhausted = true
		exhaustion_changed.emit(true)
		EventBus.player_exhausted_changed.emit(true)
	_emit_state()
	return true


func tick_recovery(delta: float) -> void:
	if tuning == null or delta <= 0.0:
		return
	if _drained_this_frame:
		_drained_this_frame = false
		return

	if _regen_delay_timer > 0.0:
		_regen_delay_timer = maxf(0.0, _regen_delay_timer - delta)
		return

	if current_stamina < tuning.stamina_max:
		current_stamina = minf(tuning.stamina_max, current_stamina + tuning.stamina_regen_per_sec * delta)
		var recovery_floor := tuning.stamina_max * tuning.exhaustion_recovery_ratio
		if is_exhausted and current_stamina >= recovery_floor:
			is_exhausted = false
			exhaustion_changed.emit(false)
			EventBus.player_exhausted_changed.emit(false)
		_emit_state()


func _emit_state() -> void:
	var max_val := tuning.stamina_max if tuning != null else 100.0
	stamina_updated.emit(current_stamina, max_val, is_exhausted)
	EventBus.stamina_changed.emit(current_stamina, max_val, is_exhausted)
