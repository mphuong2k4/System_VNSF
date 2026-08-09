import { createTheme } from "@vnsf/ui";

export const vnsfTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#078f86", dark: "#076b66", light: "#d9f5f2" },
    secondary: { main: "#e3a008", dark: "#aa7400", light: "#fff4ce" },
    background: { default: "#f4f9ff", paper: "#ffffff" },
    text: { primary: "#10284d", secondary: "#657792" },
    success: { main: "#23855b" },
    warning: { main: "#d38716" },
    error: { main: "#c23b3b" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      '"Segoe UI Variable", "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif',
    h4: { fontWeight: 750, letterSpacing: "-0.035em" },
    h5: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 700 },
    button: { fontWeight: 700, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
        },
        body: { minWidth: 320, fontFeatureSettings: '"kern" 1, "liga" 1' },
        "::selection": { background: "#cdeeff" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #e4edf8",
          boxShadow: "0 10px 32px rgba(38, 86, 143, 0.07)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 9, minHeight: 40 } },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },
  },
});
