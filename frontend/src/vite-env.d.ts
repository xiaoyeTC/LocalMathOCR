/// <reference types="vite/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      ref?: React.Ref<HTMLElement>;
      onInput?: (e: Event) => void;
      style?: React.CSSProperties;
    };
  }
}
