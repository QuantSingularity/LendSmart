import { DarkTheme, DefaultTheme } from "react-native-paper";

// --- Modernized Theme Configuration ---
// Based on docs/ui-design-concept.md and modern UI trends.
// Fonts: Poppins and Inter are good choices. Ensure they are linked:
// 1. Add font files (e.g., .ttf) to `/assets/fonts/` directory.
// 2. Create `react-native.config.js` in the root with:
//    module.exports = { project: { ios: {}, android: {} }, assets: ['./src/assets/fonts/'] };
// 3. Run `npx react-native link`.

// --- Color Palette ---
// Refined colors for better balance and modern feel.

export const lightColors = {
  primary: "#007AFF", // Apple's Blue - Professional & Clean
  secondary: "#FF3B30", // Apple's Red - Strong Accent
  success: "#34C759", // Apple's Green
  warning: "#FF9500", // Apple's Orange
  error: "#FF3B30", // Apple's Red (same as secondary for strong error indication)

  background: "#F2F2F7", // Slightly off-white (iOS style)
  surface: "#FFFFFF", // Pure white for cards/modals

  textPrimary: "#000000", // Pure black for high contrast
  textSecondary: "#8A8A8E", // Gray for secondary text (iOS style)
  textTertiary: "#C7C7CC", // Lighter gray for hints or disabled states

  border: "#D1D1D6", // Subtle border color
  disabled: "#C7C7CC", // Use tertiary text color for disabled elements
  placeholder: "#8A8A8E", // Use secondary text color for placeholders
  backdrop: "rgba(0, 0, 0, 0.4)", // Standard backdrop
};

export const darkColors = {
  primary: "#0A84FF", // Brighter Blue for dark mode (iOS style)
  secondary: "#FF453A", // Brighter Red for dark mode (iOS style)
  success: "#30D158", // Brighter Green
  warning: "#FF9F0A", // Brighter Orange
  error: "#FF453A", // Brighter Red

  background: "#000000", // Pure black for OLED screens
  surface: "#1C1C1E", // Dark gray for cards/modals (iOS style)
  surface2: "#2C2C2E", // Slightly lighter gray for nested surfaces

  textPrimary: "#FFFFFF", // Pure white
  textSecondary: "#8E8E93", // Lighter gray for secondary text (iOS style)
  textTertiary: "#48484A", // Darker gray for hints/disabled

  border: "#38383A", // Subtle border color for dark mode
  disabled: "#48484A", // Use tertiary text color
  placeholder: "#8E8E93", // Use secondary text color
  backdrop: "rgba(0, 0, 0, 0.6)", // Slightly darker backdrop
};

// --- Typography ---
// Using Inter as the primary font for its clean look.
// Ensure font files are linked as described above.
export const fonts = {
  // Using Inter as the main font family
  primary: "Inter-Regular",
  primaryMedium: "Inter-Medium",
  primarySemiBold: "Inter-SemiBold",
  primaryBold: "Inter-Bold",
  // Poppins can be secondary if needed, or remove if only Inter is used
  secondary: "Poppins-Regular",
  secondaryMedium: "Poppins-Medium",
};

// Slightly adjusted font sizes for better hierarchy
export const fontSizes = {
  h1: 34, // Large titles
  h2: 28, // Section headers
  h3: 22, // Sub-section headers
  h4: 20, // Card titles
  h5: 17, // List item titles, bold text
  h6: 15, // Emphasized body text
  body1: 17, // Standard body text (iOS default)
  body2: 15, // Smaller body text
  caption: 13, // Captions, small info
  footnote: 12, // Footnotes, very small text
};

// --- Spacing & Radius ---
// Consistent spacing scale
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12, // Adjusted medium spacing
  lg: 16, // Adjusted large spacing
  xl: 24,
  xxl: 32,
};

// Slightly increased border radius for a softer look
export const borderRadius = {
  sm: 6,
  md: 10, // Default card radius
  lg: 16,
  xl: 20,
  full: 999, // For circular elements
};

// --- React Native Paper Theme Integration ---

// Helper function to map fonts for Paper
const _mapPaperFonts = (fontConfig) => ({
  regular: { fontFamily: fontConfig.primary, fontWeight: "400" },
  medium: { fontFamily: fontConfig.primaryMedium, fontWeight: "500" },
  light: { fontFamily: fontConfig.primary, fontWeight: "300" }, // Assuming Inter-Light exists or map appropriately
  thin: { fontFamily: fontConfig.primary, fontWeight: "100" }, // Assuming Inter-Thin exists
  // Add mappings for bold etc. if Paper uses them or if you customize components
  bold: { fontFamily: fontConfig.primaryBold, fontWeight: "700" },
});

export const CombinedLightTheme = {
  ...DefaultTheme,
  roundness: borderRadius.md,
  colors: {
    ...DefaultTheme.colors,
    primary: lightColors.primary,
    accent: lightColors.secondary, // Keep for compatibility, but prefer 'secondary'
    background: lightColors.background,
    surface: lightColors.surface,
    text: lightColors.textPrimary,
    placeholder: lightColors.placeholder,
    disabled: lightColors.disabled,
    error: lightColors.error,
    notification: lightColors.secondary,
    // Custom colors accessible via theme.colors.customProperty
    ...lightColors,
  },
  // fonts: configureFonts({ default: mapPaperFonts(fonts) }), // Use configureFonts if needed
  // Add custom theme properties
  spacing: spacing,
  fontSizes: fontSizes,
  borderRadius: borderRadius,
  fonts: fonts, // Keep custom font names accessible
};

export const CombinedDarkTheme = {
  ...DarkTheme,
  roundness: borderRadius.md,
  colors: {
    ...DarkTheme.colors,
    primary: darkColors.primary,
    accent: darkColors.secondary,
    background: darkColors.background,
    surface: darkColors.surface,
    text: darkColors.textPrimary,
    placeholder: darkColors.placeholder,
    disabled: darkColors.disabled,
    error: darkColors.error,
    notification: darkColors.secondary,
    // Custom colors
    ...darkColors,
    surface2: darkColors.surface2, // Make custom surface accessible
  },
  // fonts: configureFonts({ default: mapPaperFonts(fonts) }),
  // Add custom theme properties
  spacing: spacing,
  fontSizes: fontSizes,
  borderRadius: borderRadius,
  fonts: fonts, // Keep custom font names accessible
};
