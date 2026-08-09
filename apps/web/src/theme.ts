import { createTheme } from "@vnsf/ui";

export const vnsfTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0b5d55", dark: "#073f3a", light: "#d9f0ec" },
    secondary: { main: "#d69e2e", dark: "#9c6d10", light: "#fff3d6" },
    background: { default: "#f4f7f6", paper: "#ffffff" },
    text: { primary: "#172b2a", secondary: "#607271" },
    success: { main: "#23855b" },
    warning: { main: "#d38716" },
    error: { main: "#c23b3b" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h4: { fontWeight: 750, letterSpacing: "-0.035em" },
    h5: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 700 },
    button: { fontWeight: 700, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { minWidth: 320 },
        "::selection": { background: "#bfe3dd" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #e3ebe9",
          boxShadow: "0 8px 30px rgba(18, 58, 54, 0.06)",
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
