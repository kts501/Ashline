extends Node
## Global decoupled event bus for ASHLINE.
## Lower core/entity modules emit signals here without referencing UI or higher-level managers.

signal player_state_changed(previous_state: StringName, new_state: StringName)
signal stamina_changed(current: float, maximum: float, is_exhausted: bool)
signal player_exhausted_changed(is_exhausted: bool)
signal footstep_triggered(world_position: Vector3, speed_ratio: float, is_sprinting: bool)
signal player_landed(impact_speed: float)
