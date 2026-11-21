class_name CameraRig
extends Node3D
## First-person camera rig driving yaw/pitch, crouch height, gait-synced bob, FOV kick, and landing dip.

@export var tuning: MovementTuning
@export var camera_path: NodePath = ^"Camera3D"

@onready var camera: Camera3D = get_node(camera_path)

var _pitch: float = 0.0
var _bob_phase: float = 0.0
var _landing_dip_offset: float = 0.0
var _landing_dip_velocity: float = 0.0
var _current_eye_height: float = 1.62


func _ready() -> void:
	if tuning != null:
		_current_eye_height = tuning.stand_eye_height
		camera.fov = tuning.base_fov


func apply_look_delta(relative: Vector2) -> void:
	if tuning == null:
		return
	var owner_body := get_parent() as Node3D
	if owner_body != null:
		owner_body.rotate_y(-relative.x * tuning.mouse_sensitivity)
	_pitch = clampf(_pitch - relative.y * tuning.mouse_sensitivity, deg_to_rad(-86.0), deg_to_rad(86.0))


func trigger_landing_impulse(impact_speed: float) -> void:
	if tuning == null:
		return
	var dip := clampf(impact_speed * tuning.landing_dip_scale, 0.02, 0.24)
	_landing_dip_velocity -= dip * 18.0


func update_rig(
	delta: float,
	horizontal_speed: float,
	is_grounded: bool,
	is_crouching: bool,
	is_sprinting: bool,
	strafe_input: float
) -> void:
	if tuning == null or camera == null:
		return

	# Smooth eye height between standing and crouching
	var target_eye := tuning.crouch_eye_height if is_crouching else tuning.stand_eye_height
	_current_eye_height = lerpf(_current_eye_height, target_eye, 1.0 - exp(-tuning.crouch_transition_speed * delta))

	# Spring-damped landing dip
	_landing_dip_velocity += (-_landing_dip_offset * 120.0 - _landing_dip_velocity * 18.0) * delta
	_landing_dip_offset = clampf(_landing_dip_offset + _landing_dip_velocity * delta, -0.26, 0.08)

	# Distance-synced head bob so stride matches speed
	var bob_y := 0.0
	var bob_x := 0.0
	if is_grounded and horizontal_speed > 0.25:
		_bob_phase += horizontal_speed * tuning.headbob_frequency * delta
		var amp := tuning.headbob_amplitude * (1.25 if is_sprinting else (0.55 if is_crouching else 1.0))
		bob_y = absf(sin(_bob_phase)) * amp - amp * 0.5
		bob_x = cos(_bob_phase * 0.5) * amp * 0.45
	else:
		_bob_phase = 0.0

	position.y = _current_eye_height + _landing_dip_offset + bob_y
	position.x = bob_x

	# Subtle strafe roll + pitch
	var target_roll := -strafe_input * deg_to_rad(tuning.strafe_tilt_deg)
	rotation.x = _pitch
	rotation.z = lerpf(rotation.z, target_roll, 1.0 - exp(-10.0 * delta))

	# State-driven FOV
	var target_fov := tuning.base_fov
	if is_sprinting:
		target_fov = tuning.sprint_fov
	elif is_crouching:
		target_fov = tuning.crouch_fov
	camera.fov = lerpf(camera.fov, target_fov, 1.0 - exp(-tuning.fov_lerp_speed * delta))
