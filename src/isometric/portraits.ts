export const portraitMoods = ['composed', 'stern', 'worried', 'warm', 'surprised'] as const;
export type PortraitMood = typeof portraitMoods[number];

// Choose the face for the spoken line. The same allocation can feed one household and cost another its wage.
const readings: Record<PortraitMood, string[]> = {
  composed: ['joss_work', 'joss_hub', 'mara_directions', 'mara_hub', 'mara_rotation', 'mara_after_rotation',
    'edda_spring', 'edda_hub', 'edda_rite', 'edda_after_rillford', 'darin_mediate', 'darin_rotation_ledger',
    'darin_report_rotation', 'darin_after_quarry', 'harrow_hub', 'harrow_hub2', 'harrow_train'],
  stern: ['mara_hide', 'mara_jammed', 'mara_after_quarry', 'mara_after_law', 'edda_flow', 'edda_caught',
    'edda_after_quarry', 'darin_intro', 'darin_cause', 'darin_hub', 'darin_contract', 'darin_humiliate',
    'darin_rotation_pay', 'darin_report_rillford', 'harrow_intro'],
  worried: ['joss_bell', 'mara_intro', 'mara_cause', 'mara_needs', 'mara_diversion', 'mara_report_quarry',
    'edda_sluice', 'edda_admits', 'edda_jammed', 'darin_seep', 'darin_cut', 'darin_after_rillford',
    'harrow_key', 'harrow_caretaker'],
  warm: ['joss_after', 'mara_offer', 'mara_report_rillford', 'mara_report_rotation', 'mara_after_rillford',
    'edda_intro', 'edda_archive_yes', 'edda_consent', 'edda_after_rotation', 'darin_brace',
    'darin_report_quarry', 'darin_after_rotation', 'harrow_open', 'harrow_trained'],
  surprised: ['joss_intro', 'mara_ledger'],
};
export const speakerReadings = new Map(
  portraitMoods.flatMap(mood => readings[mood].map(id => [id, mood] as const))
);
