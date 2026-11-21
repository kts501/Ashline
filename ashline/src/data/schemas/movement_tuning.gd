class_name MovementTuning
extends Resource
## Tunable parameters for Stage 1 first-person movement, stamina, and camera feel.

@export_group("Grounded Speeds")
@export var walk_speed: float = 4.6
@export var sprint_speed: float = 7.4
@export var crouch_speed: float = 2.5
@export var ground_acceleration: float = 28.0
@export var ground_deceleration: float = 24.0

@export_group("Air & Jumping")
@export var gravity: float = 19.6
@export var jump_velocity: float = 6.2
@export var jump_cut_multiplier: float = 0.5
@export var air_acceleration: float = 10.0
@export var coyote_time: float = 0.11
@export var jump_buffer_time: float = 0.12

@export_group("Dimensions & Slopes")
@export var stand_height: float = 1.80
@export var crouch_height: float = 1.05
@export var stand_eye_height: float = 1.62
@export var crouch_eye_height: float = 0.90
@export var crouch_transition_speed: float = 12.0
@export_range(15.0, 60.0, 0.5) var max_slope_angle_deg: float = 45.0

@export_group("Stamina")
@export var stamina_max: float = 100.0
@export var sprint_drain_per_sec: float = 18.0
@export var jump_stamina_cost: float = 12.0
@export var stamina_regen_delay: float = 0.90
@export var stamina_regen_per_sec: float = 22.0
@export var exhaustion_recovery_ratio: float = 0.25

@export_group("Camera Feel")
@export var mouse_sensitivity: float = 0.0022
@export var base_fov: float = 75.0
@export var sprint_fov: float = 83.0
@export var crouch_fov: float = 72.0
@export var fov_lerp_speed: float = 8.5
@export var headbob_frequency: float = 2.15
@export var headbob_amplitude: float = 0.045
@export var strafe_tilt_deg: float = 1.4
@export var landing_dip_scale: float = 0.032
