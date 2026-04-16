import AsyncStorage from "@react-native-async-storage/async-storage";
import PropTypes from "prop-types";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import { CombinedDarkTheme, CombinedLightTheme } from "../theme/theme";

// Theme preference storage key
const THEME_PREFERENCE_KEY = "themePreference";
// Theme mode options
const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system", // Follow system preference
};

export const ThemeContext = createContext({
  isDark: false,
  theme: CombinedLightTheme,
  themeMode: THEME_MODES.SYSTEM,
  toggleTheme: () => {},
  setThemeMode: () => {},
  colors: CombinedLightTheme.colors,
  fonts: CombinedLightTheme.fonts,
});

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme(); // 'light', 'dark', or null
  const [themeMode, setThemeModeState] = useState(THEME_MODES.SYSTEM);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedThemeMode = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
        if (
          savedThemeMode &&
          Object.values(THEME_MODES).includes(savedThemeMode)
        ) {
          setThemeModeState(savedThemeMode);
        }
      } catch (error) {
        console.error("Failed to load theme preference:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemePreference();
  }, []);

  // Determine if dark mode should be active based on theme mode and system preference
  const isDark = useMemo(() => {
    if (themeMode === THEME_MODES.SYSTEM) {
      return systemColorScheme === "dark";
    }
    return themeMode === THEME_MODES.DARK;
  }, [themeMode, systemColorScheme]);

  // Get the appropriate theme object based on dark mode state
  const theme = useMemo(
    () => (isDark ? CombinedDarkTheme : CombinedLightTheme),
    [isDark],
  );

  // Toggle between light and dark mode
  const toggleTheme = useCallback(() => {
    const newThemeMode = isDark ? THEME_MODES.LIGHT : THEME_MODES.DARK;
    setThemeMode(newThemeMode);
  }, [isDark, setThemeMode]);

  // Set theme mode and persist to storage
  const setThemeMode = useCallback(async (mode) => {
    if (!Object.values(THEME_MODES).includes(mode)) {
      console.error(`Invalid theme mode: ${mode}`);
      return;
    }

    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, mode);
      setThemeModeState(mode);
    } catch (error) {
      console.error("Failed to save theme preference:", error);
    }
  }, []);

  // Extract colors and fonts for easier access
  const { colors, fonts } = theme;

  // Create context value with memoization for performance
  const contextValue = useMemo(
    () => ({
      isDark,
      theme,
      themeMode,
      toggleTheme,
      setThemeMode,
      colors,
      fonts,
      isLoading,
      THEME_MODES,
    }),
    [
      isDark,
      theme,
      themeMode,
      toggleTheme,
      setThemeMode,
      colors,
      fonts,
      isLoading,
    ],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Add prop types validation
ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ThemeProvider;
