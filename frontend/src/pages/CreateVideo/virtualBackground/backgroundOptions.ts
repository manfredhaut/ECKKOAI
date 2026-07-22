export interface BackgroundOption {
  id: string;
  labelKey: string;
  // null = "none" (raw camera, no segmentation cost)
  color: [number, number, number] | null;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "none", labelKey: "createVideo.avatarSetup.background.none", color: null },
  { id: "white", labelKey: "createVideo.avatarSetup.background.white", color: [255, 255, 255] },
  { id: "lightGray", labelKey: "createVideo.avatarSetup.background.lightGray", color: [224, 224, 224] },
  { id: "darkGray", labelKey: "createVideo.avatarSetup.background.darkGray", color: [64, 64, 64] },
  { id: "chromaGreen", labelKey: "createVideo.avatarSetup.background.chromaGreen", color: [0, 177, 64] },
];

export const DEFAULT_BACKGROUND_ID = "none";
