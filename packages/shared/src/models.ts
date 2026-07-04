// Provider-neutral defaults. Model + provider selection is live (fetched from
// each provider) and stored in settings — nothing is hardcoded to a vendor.

export const DEFAULT_EFFORT = "medium";

export interface ModelOption {
  id: string;
  display_name: string;
}
