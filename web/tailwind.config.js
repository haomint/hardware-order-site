/** 颜色、圆角等设计变量集中定义在 src/index.css 的 :root 里，这里只做映射。 */
const color = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: color("brand"),
          dark: color("brand-dark"),
          soft: color("brand-soft"),
        },
        accent: {
          DEFAULT: color("accent"),
          dark: color("accent-dark"),
        },
        ink: color("ink"),
        muted: color("muted"),
        faint: color("faint"),
        line: color("line"),
        page: color("page"),
        surface: color("surface"),
      },
      borderRadius: {
        card: "var(--r-card)",
        control: "var(--r-control)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 40, 60, 0.06)",
        bar: "0 -2px 12px rgba(20, 40, 60, 0.08)",
      },
      minHeight: { tap: "44px" },
      minWidth: { tap: "44px" },
      maxWidth: { shell: "720px" },
    },
  },
  plugins: [],
};
