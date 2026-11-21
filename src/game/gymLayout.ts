export type SurfaceMaterialTag = 'concrete' | 'amber' | 'steep_red' | 'steel' | 'asphalt';

export interface BoxCollider {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  material: SurfaceMaterialTag;
  label?: string;
  /** Optional hint to render weathered amber parkour edge tape on top edges */
  parkourLedge?: boolean;
}

export interface RampCollider {
  id: string;
  minX: number;
  maxX: number;
  /** Z coordinate where the ramp begins at baseY */
  startZ: number;
  /** Z coordinate where the ramp ends at topY (typically startZ > endZ going north) */
  endZ: number;
  baseY: number;
  topY: number;
  angleDeg: number;
  material: SurfaceMaterialTag;
  label?: string;
}

export interface GymColliders {
  boxes: BoxCollider[];
  ramps: RampCollider[];
  boundsRadius: number;
}

function makeRamp(
  id: string,
  centerX: number,
  width: number,
  startZ: number,
  length: number,
  angleDeg: number,
  material: SurfaceMaterialTag,
  label: string
): RampCollider {
  const rad = (angleDeg * Math.PI) / 180;
  const topY = Math.tan(rad) * length;
  return {
    id,
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    startZ,
    endZ: startZ - length,
    baseY: 0,
    topY,
    angleDeg,
    material,
    label,
  };
}

export function createMovementGymColliders(): GymColliders {
  const boxes: BoxCollider[] = [
    // =========================================================================
    // STAGE 1 PRESERVED METRIC STATIONS (Steps, Waist Blocks, 2m Wall, Duct, Ramps)
    // =========================================================================
    { id: 'step_05', minX: -14, maxX: -10, minY: 0, maxY: 0.5, minZ: 4, maxZ: 6, material: 'amber', label: '0.5m Step' },
    { id: 'step_10', minX: -14, maxX: -10, minY: 0, maxY: 1.0, minZ: 2, maxZ: 4, material: 'amber', parkourLedge: true },
    { id: 'step_15', minX: -14, maxX: -10, minY: 0, maxY: 1.5, minZ: 0, maxZ: 2, material: 'amber', parkourLedge: true },
    { id: 'step_20', minX: -14, maxX: -10, minY: 0, maxY: 2.0, minZ: -4, maxZ: 0, material: 'amber', label: '2.0m Deck', parkourLedge: true },

    { id: 'gap_plat_1', minX: -14, maxX: -10, minY: 0, maxY: 2.0, minZ: -9.6, maxZ: -6.6, material: 'amber', label: '2.6m Gap', parkourLedge: true },
    { id: 'gap_plat_2', minX: -14, maxX: -10, minY: 0, maxY: 2.0, minZ: -15.0, maxZ: -12.2, material: 'amber', label: '2.6m Gap', parkourLedge: true },

    // Vaultable 1.0m Waist Barriers (center-left lane)
    { id: 'waist_1m_a', minX: -7.5, maxX: -4.5, minY: 0, maxY: 1.0, minZ: 1.4, maxZ: 2.2, material: 'amber', label: '1.0m Vault', parkourLedge: true },
    { id: 'waist_1m_b', minX: -7.5, maxX: -4.5, minY: 0, maxY: 1.0, minZ: -4.2, maxZ: -3.4, material: 'amber', parkourLedge: true },

    // 2.0m Mantle Reference Wall (deep enough to stand atop cleanly)
    { id: 'wall_2m', minX: -7.5, maxX: -4.0, minY: 0, maxY: 2.0, minZ: -11.4, maxZ: -9.3, material: 'concrete', label: '2.0m Mantle', parkourLedge: true },

    // Center Crouch Duct (1.2m clearance)
    { id: 'duct_left', minX: -2.4, maxX: -1.8, minY: 0, maxY: 2.4, minZ: -14, maxZ: -6, material: 'concrete' },
    { id: 'duct_right', minX: 1.8, maxX: 2.4, minY: 0, maxY: 2.4, minZ: -14, maxZ: -6, material: 'concrete' },
    { id: 'duct_roof', minX: -2.4, maxX: 2.4, minY: 1.2, maxY: 2.4, minZ: -14, maxZ: -6, material: 'amber', label: '1.2m Crouch Duct' },

    // Walkable Ramp Staging Decks
    { id: 'ramp_deck_15', minX: 5.5, maxX: 8.5, minY: 0, maxY: Math.tan((15 * Math.PI) / 180) * 6, minZ: -14, maxZ: -11, material: 'concrete', parkourLedge: true },
    { id: 'ramp_deck_30', minX: 10.5, maxX: 13.5, minY: 0, maxY: Math.tan((30 * Math.PI) / 180) * 5, minZ: -14, maxZ: -10, material: 'concrete', parkourLedge: true },
    { id: 'ramp_deck_45', minX: 15.5, maxX: 18.5, minY: 0, maxY: Math.tan((43 * Math.PI) / 180) * 4, minZ: -13, maxZ: -9, material: 'concrete', parkourLedge: true },

    // =========================================================================
    // STAGE 2 PARKOUR TEST COURSE — VAULT LANE, CLIMB BLOCKS, CONNECTED ROOFTOPS
    // =========================================================================

    // 1. Vault Run Lane (South-East Yard: x = 5..9, z = 22 -> -1)
    // Player runs north along x=7.0 chaining small (0.92m) -> medium (1.05m, 1.16m) barriers -> Slide Gate
    { id: 'vault_bar_1', minX: 5.0, maxX: 9.0, minY: 0, maxY: 0.92, minZ: 17.0, maxZ: 17.65, material: 'amber', parkourLedge: true },
    { id: 'vault_bar_2', minX: 5.0, maxX: 9.0, minY: 0, maxY: 1.05, minZ: 11.2, maxZ: 11.85, material: 'amber', parkourLedge: true },
    { id: 'vault_bar_3', minX: 5.0, maxX: 9.0, minY: 0, maxY: 1.16, minZ: 5.4, maxZ: 6.15, material: 'amber', parkourLedge: true },
    // Slide Gate at end of Vault Lane (1.12m clearance -> Sprint -> Vault -> Slide -> Run)
    { id: 'vault_slide_left', minX: 4.8, maxX: 5.3, minY: 0, maxY: 2.3, minZ: -0.6, maxZ: 1.2, material: 'steel' },
    { id: 'vault_slide_right', minX: 8.7, maxX: 9.2, minY: 0, maxY: 2.3, minZ: -0.6, maxZ: 1.2, material: 'steel' },
    { id: 'vault_slide_roof', minX: 4.8, maxX: 9.2, minY: 1.12, maxY: 2.3, minZ: -0.6, maxZ: 1.2, material: 'amber', label: '1.1m Slide Gate' },

    // 2. Medium Climb + Mantle Ascent Chain (West-North Sector: x = -28..-22)
    // Ground -> 1.1m Medium Climb Crate -> 2.4m Shipping Container -> 3.6m Roof A
    { id: 'climb_crate_1', minX: -27.5, maxX: -23.5, minY: 0, maxY: 1.1, minZ: 14.0, maxZ: 17.0, material: 'amber', parkourLedge: true },
    { id: 'climb_crate_2', minX: -27.5, maxX: -23.5, minY: 0, maxY: 2.35, minZ: 9.5, maxZ: 13.0, material: 'steel', parkourLedge: true },

    // Connected Rooftop A (x: -29..-21, z: -2..8, topY = 3.6m)
    { id: 'rooftop_a', minX: -29.0, maxX: -21.0, minY: 0, maxY: 3.6, minZ: -2.0, maxZ: 8.2, material: 'concrete', parkourLedge: true },
    // Rooftop A low vault railing at north edge (y = 3.6..4.55)
    { id: 'rooftop_a_rail', minX: -28.0, maxX: -22.0, minY: 3.6, maxY: 4.55, minZ: -2.0, maxZ: -1.45, material: 'amber', parkourLedge: true },

    // Connected Rooftop B (2.7m gap north from Rooftop A, slight rise to 4.1m)
    { id: 'rooftop_b', minX: -29.0, maxX: -20.5, minY: 0, maxY: 4.1, minZ: -16.5, maxZ: -4.7, material: 'concrete', parkourLedge: true },

    // Rooftop B Narrow HVAC Crouch Passage (y = 4.1..5.25 clear inside, roof 5.25..6.1)
    { id: 'hvac_wall_left', minX: -26.8, maxX: -26.0, minY: 4.1, maxY: 6.1, minZ: -14.5, maxZ: -8.5, material: 'steel' },
    { id: 'hvac_wall_right', minX: -23.8, maxX: -23.0, minY: 4.1, maxY: 6.1, minZ: -14.5, maxZ: -8.5, material: 'steel' },
    { id: 'hvac_roof', minX: -26.8, maxX: -23.0, minY: 5.25, maxY: 6.1, minZ: -14.5, maxZ: -8.5, material: 'amber' },

    // Connected Rooftop C (east across 3.0m rooftop gap from Rooftop B, stepped up to 5.4m -> requires Jump + Mantle!)
    { id: 'rooftop_c', minX: -17.8, maxX: -9.0, minY: 0, maxY: 5.4, minZ: -27.5, maxZ: -17.5, material: 'concrete', parkourLedge: true },
    // Alternate street-side step-up access to Rooftop C (from Gap Plat 2 at y=2.0 -> step block at y=3.7 -> Rooftop C at y=5.4)
    { id: 'rooftop_c_midledge', minX: -14.5, maxX: -10.5, minY: 0, maxY: 3.7, minZ: -17.5, maxZ: -15.5, material: 'steel', parkourLedge: true },

    // Connected Rooftop D (East Skybridge Platform at y=4.6m after a 3.2m run-jump east from Rooftop C)
    { id: 'rooftop_d', minX: -5.8, maxX: 5.5, minY: 0, maxY: 4.6, minZ: -27.0, maxZ: -18.5, material: 'concrete', parkourLedge: true },
    // Rooftop D central skylight vault obstacle (y=4.6..5.55)
    { id: 'rooftop_d_skylight', minX: -1.5, maxX: 1.5, minY: 4.6, maxY: 5.55, minZ: -23.3, maxZ: -22.5, material: 'amber', parkourLedge: true },

    // Descent / Return Catwalk from Rooftop D down to East Container Cluster
    { id: 'descent_tier_1', minX: 8.2, maxX: 13.5, minY: 0, maxY: 3.3, minZ: -25.0, maxZ: -19.5, material: 'steel', parkourLedge: true },
    { id: 'descent_tier_2', minX: 15.8, maxX: 21.0, minY: 0, maxY: 2.0, minZ: -24.5, maxZ: -19.0, material: 'amber', parkourLedge: true },

    // East Yard Shipping Container Cluster (Climbable 1.25m crate -> 2.6m container)
    { id: 'east_step_crate', minX: 13.0, maxX: 16.5, minY: 0, maxY: 1.25, minZ: 7.0, maxZ: 9.8, material: 'amber', parkourLedge: true },
    { id: 'container_east', minX: 12.0, maxX: 18.2, minY: 0, maxY: 2.6, minZ: 4.0, maxZ: 6.6, material: 'steel', parkourLedge: true },

    // Occlusion / Wall-Block Test Corner (solid tall wall directly behind a low block to verify no through-wall parkour)
    { id: 'occlude_wall_check', minX: 23.0, maxX: 28.0, minY: 0, maxY: 4.0, minZ: 12.0, maxZ: 13.0, material: 'concrete' },
    { id: 'occlude_box_behind', minX: 24.0, maxX: 27.0, minY: 0, maxY: 1.1, minZ: 10.4, maxZ: 11.4, material: 'amber', parkourLedge: true },

    // =========================================================================
    // STAGE 4 DEDICATED PARKOUR FLOW CIRCUIT (East Corridor: x = 30..36, z = 24 -> -27)
    // Tests: Quick Vault -> Slide Gate -> Medium Vault -> Climb Launch -> Gap Jump + Ledge Hang/Muscle-Up -> High Rooftop Vault -> Drop
    // =========================================================================
    { id: 'flow_quick_vault', minX: 30.0, maxX: 36.0, minY: 0, maxY: 0.85, minZ: 18.8, maxZ: 19.35, material: 'amber', parkourLedge: true },
    { id: 'flow_slide_left', minX: 30.0, maxX: 30.6, minY: 0, maxY: 2.35, minZ: 12.2, maxZ: 14.4, material: 'steel' },
    { id: 'flow_slide_right', minX: 35.4, maxX: 36.0, minY: 0, maxY: 2.35, minZ: 12.2, maxZ: 14.4, material: 'steel' },
    { id: 'flow_slide_roof', minX: 30.0, maxX: 36.0, minY: 1.12, maxY: 2.35, minZ: 12.2, maxZ: 14.4, material: 'amber', label: '1.1m Slide Beam' },
    { id: 'flow_med_vault', minX: 30.0, maxX: 36.0, minY: 0, maxY: 1.15, minZ: 6.5, maxZ: 7.45, material: 'concrete', parkourLedge: true },
    { id: 'flow_launch_a', minX: 30.0, maxX: 36.0, minY: 0, maxY: 1.15, minZ: -1.5, maxZ: 2.2, material: 'amber', parkourLedge: true },
    { id: 'flow_plat_b', minX: 30.0, maxX: 36.0, minY: 0, maxY: 3.05, minZ: -11.5, maxZ: -4.2, material: 'concrete', parkourLedge: true },
    { id: 'flow_plat_c', minX: 30.0, maxX: 36.0, minY: 0, maxY: 4.55, minZ: -21.5, maxZ: -14.0, material: 'steel', parkourLedge: true },
    { id: 'flow_roof_vault', minX: 30.5, maxX: 35.5, minY: 4.55, maxY: 5.42, minZ: -18.5, maxZ: -17.9, material: 'amber', parkourLedge: true },
    { id: 'flow_return_tier', minX: 30.5, maxX: 35.5, minY: 0, maxY: 2.35, minZ: -26.5, maxZ: -23.5, material: 'amber', parkourLedge: true },

    // Perimeter Quarantine Wall inner bounds (38m x 38m yard)
    { id: 'qwall_north', minX: -40, maxX: 40, minY: 0, maxY: 8.5, minZ: -40, maxZ: -38, material: 'concrete' },
    { id: 'qwall_south', minX: -40, maxX: 40, minY: 0, maxY: 8.5, minZ: 38, maxZ: 40, material: 'concrete' },
    { id: 'qwall_west', minX: -40, maxX: -38, minY: 0, maxY: 8.5, minZ: -38, maxZ: 38, material: 'concrete' },
    { id: 'qwall_east', minX: 38, maxX: 40, minY: 0, maxY: 8.5, minZ: -38, maxZ: 38, material: 'concrete' },
  ];

  const ramps: RampCollider[] = [
    makeRamp('ramp_15', 7.0, 3.0, -5.0, 6.0, 15, 'amber', '15° Ramp'),
    makeRamp('ramp_30', 12.0, 3.0, -5.0, 5.0, 30, 'amber', '30° Ramp'),
    makeRamp('ramp_43', 17.0, 3.0, -5.0, 4.0, 43, 'amber', '43° Limit'),
    makeRamp('ramp_50', 22.0, 3.0, -5.0, 4.0, 50, 'steep_red', '50° Steep Slide'),
  ];

  return {
    boxes,
    ramps,
    boundsRadius: 37.5,
  };
}
