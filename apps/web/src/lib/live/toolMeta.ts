import { Search, Globe, Eye, Network, Route, BookOpen, FileImage, Image as ImageIcon, List, Wrench } from "lucide-react";

// Human labels + icon per tool — shared by the transcript (chips) and the in-call
// status line, so "Searching the product" reads the same everywhere. Covers the
// live agent's tool set (product graph + manuals + camera).
export const TOOL_META: Record<string, { label: string; active: string; icon: typeof Wrench }> = {
  search_product: { label: "Searched the product", active: "Searching the product", icon: Search },
  find_entity: { label: "Found the part", active: "Pinpointing the part", icon: Network },
  explore_entity: { label: "Traced connections", active: "Tracing connections", icon: Network },
  trace_path: { label: "Found the link", active: "Finding the link", icon: Route },
  get_media: { label: "Gathered media", active: "Gathering media", icon: ImageIcon },
  read_profile: { label: "Read the docs", active: "Reading the docs", icon: BookOpen },
  get_page_image: { label: "Opened a manual page", active: "Opening a manual page", icon: FileImage },
  crop_page_image: { label: "Cropped a page", active: "Cropping a page", icon: FileImage },
  list_products: { label: "Checked the catalog", active: "Checking the catalog", icon: List },
  fetch_url: { label: "Read a page", active: "Reading a page", icon: Globe },
  look: { label: "Took a look", active: "Looking", icon: Eye },
  show_overlay: { label: "Marked up the view", active: "Marking up the view", icon: ImageIcon },
};

export const toolMeta = (tool: string) =>
  TOOL_META[tool] ?? { label: tool.replace(/_/g, " "), active: `Using ${tool.replace(/_/g, " ")}`, icon: Wrench };
