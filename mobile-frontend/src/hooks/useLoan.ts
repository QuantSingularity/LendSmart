import { useContext } from "react";
import { LoanContext } from "../contexts/LoanContext";

/**
 * Custom hook to access loan context
 * @returns Loan context value
 */
export const useLoan = () => {
  const context = useContext(LoanContext);

  if (!context) {
    throw new Error("useLoan must be used within a LoanProvider");
  }

  return context;
};

export default useLoan;
