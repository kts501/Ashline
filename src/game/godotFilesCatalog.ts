export interface GodotSourceEntry {
  path: string;
  role: string;
  summary: string;
}

export const GODOT_STAGE1_FILES: GodotSourceEntry[] = [
  {
    path: 'ashline/project.godot',
    role: 'Engine Config',
    summary: 'OpenGL 3.3 GL Compatibility renderer, Jolt Physics, EventBus autoload, and WASD/Shift/C/Space input map.',
  },
  {
    path: 'ashline/src/core/event_bus.gd',
    role: 'Core Service',
    summary: 'Decoupled global signal hub for player state, stamina, exhaustion, footsteps, and landing impacts.',
  },
  {
    path: 'ashline/src/data/schemas/movement_tuning.gd',
    role: 'Data Schema',
    summary: 'Exported Resource class defining speeds, jump impulse, coyote time, jump buffer, slopes, stamina, and camera feel.',
  },
  {
    path: 'ashline/src/data/definitions/default_movement_tuning.tres',
    role: 'Data Asset',
    summary: 'Default Stage 1 tuning asset matching the live prototype parameters.',
  },
  {
    path: 'ashline/src/components/stamina_component.gd',
    role: 'Component',
    summary: 'Self-contained stamina pool with regen delay and 25% exhaustion recovery lockout.',
  },
  {
    path: 'ashline/src/entities/player/player_controller.gd',
    role: 'Player HSM',
    summary: 'CharacterBody3D controller with IDLE/WALK/SPRINT/CROUCH/AIRBORNE states and ShapeCast3D ceiling clearance.',
  },
  {
    path: 'ashline/src/entities/player/camera_rig.gd',
    role: 'Presentation',
    summary: 'First-person mouse look, crouch height interpolation, distance-synced headbob, FOV kick, and landing dip.',
  },
  {
    path: 'ashline/src/entities/player/player.tscn',
    role: 'Entity Scene',
    summary: 'Player scene wiring Standing/Crouch colliders, CeilingCheck ShapeCast3D, StaminaComponent, and CameraRig.',
  },
  {
    path: 'ashline/src/world/test_gym/movement_test_gym.tscn',
    role: 'Test Gym',
    summary: 'Metric greybox test arena (1m block, 2m wall, 25deg walkable ramp, 50deg steep ramp, overcast sky & fog).',
  },
];
