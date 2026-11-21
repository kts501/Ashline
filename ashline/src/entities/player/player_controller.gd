class_name PlayerController
extends CharacterBody3D
## Stage 1 first-person movement controller using a Hierarchical State Machine.
## States: &"IDLE", &"WALK", &"SPRINT", &"CROUCH", &"AIRBORNE"

@export var tuning: MovementTuning

@onready var standing_collider: CollisionShape3D = $StandingCollider
@onready var crouch_collider: CollisionShape3D = $CrouchCollider
@onready var ceiling_check: ShapeCast3D = $CeilingCheck
@onready var stamina: StaminaComponent = $StaminaComponent
@onready var camera_rig: CameraRig = $CameraRig

var current_state: StringName = &"IDLE"
var is_crouching: bool = false

var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0
var _was_grounded: bool = true
var _last_fall_speed: float = 0.0
var _footstep_distance: float = 0.0


func _ready() -> void:
	if tuning == null:
		push_error("PlayerController requires a MovementTuning resource.")
		return
	floor_max_angle = deg_to_rad(tuning.max_slope_angle_deg)
	floor_snap_length = 0.35
	stamina.tuning = tuning
	camera_rig.tuning = tuning
	_apply_crouch_colliders(false)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		camera_rig.apply_look_delta((event as InputEventMouseMotion).relative)
	elif event.is_action_pressed("pause"):
		var next_mode := Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
		Input.mouse_mode = next_mode
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _physics_process(delta: float) -> void:
	if tuning == null:
		return

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var move_dir := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()

	if Input.is_action_just_pressed("jump"):
		_jump_buffer_timer = tuning.jump_buffer_time
	else:
		_jump_buffer_timer = maxf(0.0, _jump_buffer_timer - delta)

	# Crouch toggle/hold with ceiling clearance guard
	var wants_crouch := Input.is_action_pressed("crouch")
	if wants_crouch and not is_crouching:
		is_crouching = true
		_apply_crouch_colliders(true)
	elif not wants_crouch and is_crouching and _can_stand_up():
		is_crouching = false
		_apply_crouch_colliders(false)

	var grounded := is_on_floor()
	if grounded:
		_coyote_timer = tuning.coyote_time
		if not _was_grounded and _last_fall_speed > 2.5:
			camera_rig.trigger_landing_impulse(_last_fall_speed)
			EventBus.player_landed.emit(_last_fall_speed)
		_last_fall_speed = 0.0
	else:
		_coyote_timer = maxf(0.0, _coyote_timer - delta)
		if velocity.y < 0.0:
			_last_fall_speed = maxf(_last_fall_speed, -velocity.y)

	# Jump execution (supports coyote time + buffered jump)
	if _jump_buffer_timer > 0.0 and _coyote_timer > 0.0 and not is_crouching:
		if stamina.try_consume_instant(tuning.jump_stamina_cost):
			velocity.y = tuning.jump_velocity
			_jump_buffer_timer = 0.0
			_coyote_timer = 0.0
			grounded = false

	# Variable jump cut when releasing jump early
	if not grounded and Input.is_action_just_released("jump") and velocity.y > 0.0:
		velocity.y *= tuning.jump_cut_multiplier

	# Determine sprint eligibility
	var wants_sprint := Input.is_action_pressed("sprint") and input_dir.y < -0.1 and not is_crouching and grounded
	var is_sprinting := wants_sprint and stamina.can_sprint()

	# Horizontal acceleration
	var target_speed := tuning.walk_speed
	if is_crouching:
		target_speed = tuning.crouch_speed
	elif is_sprinting:
		target_speed = tuning.sprint_speed
		stamina.consume_continuous(tuning.sprint_drain_per_sec, delta)

	var target_vel := move_dir * target_speed
	var horiz_vel := Vector3(velocity.x, 0.0, velocity.z)
	var accel := tuning.ground_acceleration if grounded else tuning.air_acceleration
	if move_dir == Vector3.ZERO and grounded:
		accel = tuning.ground_deceleration

	horiz_vel = horiz_vel.move_toward(target_vel, accel * delta)
	velocity.x = horiz_vel.x
	velocity.z = horiz_vel.z

	if not grounded:
		velocity.y -= tuning.gravity * delta

	stamina.tick_recovery(delta)
	move_and_slide()

	# Transition HSM state & notify EventBus on change
	var next_state := _resolve_state(is_on_floor(), is_sprinting, horiz_vel.length())
	if next_state != current_state:
		var prev := current_state
		current_state = next_state
		EventBus.player_state_changed.emit(prev, current_state)

	# Distance-based footstep events
	if is_on_floor() and horiz_vel.length() > 0.6:
		_footstep_distance += horiz_vel.length() * delta
		var step_interval := 1.75 if is_sprinting else (1.35 if is_crouching else 1.55)
		if _footstep_distance >= step_interval:
			_footstep_distance = 0.0
			EventBus.footstep_triggered.emit(global_position, horiz_vel.length() / tuning.sprint_speed, is_sprinting)
	else:
		_footstep_distance = 0.0

	camera_rig.update_rig(delta, horiz_vel.length(), is_on_floor(), is_crouching, is_sprinting, input_dir.x)
	_was_grounded = is_on_floor()


func _resolve_state(grounded: bool, is_sprinting: bool, horiz_speed: float) -> StringName:
	if not grounded:
		return &"AIRBORNE"
	if is_crouching:
		return &"CROUCH"
	if is_sprinting and horiz_speed > tuning.walk_speed * 0.9:
		return &"SPRINT"
	if horiz_speed > 0.25:
		return &"WALK"
	return &"IDLE"


func _apply_crouch_colliders(crouched: bool) -> void:
	standing_collider.disabled = crouched
	crouch_collider.disabled = not crouched


func _can_stand_up() -> bool:
	ceiling_check.force_shapecast_update()
	return not ceiling_check.is_colliding()
