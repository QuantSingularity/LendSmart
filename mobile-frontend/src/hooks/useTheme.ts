import { useContext } from "react";
import { ThemeContext } from "../contexts/ThemeContext";

/**
 * Custom hook to access theme context
 * @returns Theme context value with theme and toggleTheme function
 */
export const useAppTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }

  return context;
};

export default useAppTheme;
