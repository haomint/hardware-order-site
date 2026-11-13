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
        card: "0 2px 10px rgba(17, 38, 80, 0.05), 0 1px 2px rgba(17, 38, 80, 0.04)",
        float: "0 8px 24px rgba(17, 38, 80, 0.10)",
        bar: "0 -4px 16px rgba(17, 38, 80, 0.06)",
        accent: "0 4px 12px rgba(255, 107, 26, 0.32)",
        brand: "0 8px 20px rgba(31, 90, 246, 0.28)",
      },
      minHeight: { tap: "44px" },
      minWidth: { tap: "44px" },
      maxWidth: { shell: "640px" },
    },
  },
  plugins: [],
};
