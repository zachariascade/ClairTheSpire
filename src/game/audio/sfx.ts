export const sfxLibrary = {
  ui: {
    cardHover: "audio/sfx/kenney-interface/select_001.ogg",
    cardPlay: "audio/sfx/kenney-interface/drop_003.ogg",
    confirm: "audio/sfx/kenney-interface/confirmation_001.ogg",
    cancel: "audio/sfx/kenney-interface/back_001.ogg",
    error: "audio/sfx/kenney-interface/error_003.ogg",
    turnStart: "audio/sfx/kenney-interface/open_001.ogg",
  },
  combat: {
    block: "audio/sfx/kenney-impact/impactPlank_medium_004.ogg",
    bodyHit: "audio/sfx/kenney-impact/impactPunch_medium_002.ogg",
    heavyBodyHit: "audio/sfx/kenney-impact/impactPunch_heavy_001.ogg",
    lightImpact: "audio/sfx/kenney-impact/impactGeneric_light_002.ogg",
    laserCharge: "audio/sfx/tinysized-fantasy/paralyzer-discharge-02.wav",
    laserFire: "audio/sfx/tinysized-fantasy/paralyzer-discharge-01.wav",
    laserImpact: "audio/sfx/kenney-impact/impactMetal_heavy_003.ogg",
    metalBlock: "audio/sfx/kenney-impact/impactMetal_medium_001.ogg",
    swordClash: "audio/sfx/tinysized-fantasy/sword-clash-03.wav",
    swordDraw: "audio/sfx/tinysized-fantasy/knife-unsheathe-02.wav",
    whoosh: "audio/sfx/tinysized-fantasy/tube-plastic-whoosh-01.wav",
  },
  status: {
    buff: "audio/sfx/kenney-interface/maximize_003.ogg",
    debuff: "audio/sfx/kenney-interface/minimize_003.ogg",
    heal: "audio/sfx/kenney-interface/glass_004.ogg",
    perfection: "audio/sfx/kenney-interface/confirmation_004.ogg",
  },
} as const;

export type SfxCategory = keyof typeof sfxLibrary;
export type SfxKey<TCategory extends SfxCategory = SfxCategory> = keyof (typeof sfxLibrary)[TCategory];
export type SfxCue = {
  [TCategory in SfxCategory]: `${TCategory}.${Extract<SfxKey<TCategory>, string>}`;
}[SfxCategory];
