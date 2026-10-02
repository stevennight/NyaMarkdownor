export type BlockStyle =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "code-block";

/** What the formatting toolbar shows as active at the cursor. */
export type FormatState = {
  block: BlockStyle;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
};

export const EMPTY_FORMAT_STATE: FormatState = {
  block: "paragraph",
  bold: false,
  italic: false,
  strike: false,
  code: false,
  link: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false
};

export function sameFormatState(left: FormatState, right: FormatState): boolean {
  return (Object.keys(left) as Array<keyof FormatState>).every((key) => left[key] === right[key]);
}
