import { Search, FileText, Image as ImageIcon, Boxes, Check, Globe, Eye, HelpCircle, type LucideIcon } from "lucide-react";

// One source of truth for tool → { icon, active label, done label }, shared by the
// ProcessRail step log and the StatusBar strip. `active` shows while the tool runs
// (gerund + shimmer), `done` once it's finished — together they read as staged
// progress: searching → reading → building.

export interface ToolMeta { icon: LucideIcon; active: string; done: string; }

export const TOOL_META: Record<string, ToolMeta> = {
  search_product: { icon: Search, active: "Searching the product…", done: "Searched the product" },
  get_media: { icon: ImageIcon, active: "Gathering media…", done: "Gathered the media" },
  read_profile: { icon: FileText, active: "Reading the docs…", done: "Read the docs" },
  get_page_image: { icon: ImageIcon, active: "Opening a page…", done: "Opened a page" },
  crop_page_image: { icon: ImageIcon, active: "Cropping a page…", done: "Cropped a page" },
  start_canvas: { icon: Boxes, active: "Starting the canvas…", done: "Started the canvas" },
  build_canvas: { icon: Boxes, active: "Building the canvas…", done: "Built the canvas" },
  edit_canvas: { icon: Boxes, active: "Editing the canvas…", done: "Edited the canvas" },
  read_canvas: { icon: FileText, active: "Reading the canvas…", done: "Read the canvas" },
  select_canvas: { icon: Boxes, active: "Highlighting a block…", done: "Highlighted a block" },
  update_todos: { icon: Check, active: "Planning the steps…", done: "Planned the steps" },
  ask_user: { icon: HelpCircle, active: "Asking a question…", done: "Asked a question" },
  fetch_url: { icon: Globe, active: "Fetching the page…", done: "Fetched the page" },
  list_products: { icon: FileText, active: "Checking the catalog…", done: "Checked the catalog" },
  look: { icon: Eye, active: "Looking…", done: "Looked" },
};

export function toolMeta(tool: string): ToolMeta {
  return TOOL_META[tool] ?? { icon: Search, active: tool, done: tool };
}
