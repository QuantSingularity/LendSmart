/**
 * @format
 */

import renderer from "react-test-renderer"; // Using 'renderer' as a common alias
import App from "../App"; // This correctly targets App.tsx in the mobile-frontend root

describe("App (React Native Template Entry Point)", () => {
  it("renders correctly and contains expected default template content", async () => {
    let tree;
    // Wrapping create call with act and awaiting it, as in the original test structure
    // This handles potential async operations during the component's first render cycle.
    await renderer.act(async () => {
      tree = renderer.create(<App />);
    });

    // Check if the component rendered something
    expect(tree).toBeDefined();
    const jsonTree = tree.toJSON();
    expect(jsonTree).not.toBeNull();

    // Convert the rendered tree to a string to check for specific text content
    // This is a basic check for the template screen.
    // For more complex interactions or component-specific tests, @testing-library/react-native is generally preferred.
    const appString = JSON.stringify(jsonTree);

    // Check for key phrases from the default React Native template screen (App.tsx)
    expect(appString).toContain("Step One");
    expect(appString).toContain("Edit App.tsx to change this screen");
    expect(appString).toContain("See Your Changes");
    expect(appString).toContain("Debug");
    expect(appString).toContain("Learn More");

    // Basic structure check: the root element should be a View.
    if (jsonTree) {
      // Ensure jsonTree is not null before accessing properties
      expect(jsonTree.type).toBe("View");
      // Check for the ScrollView which is a direct child in the template App.tsx
      const scrollView = Array.isArray(jsonTree.children)
        ? jsonTree.children.find((child) => child.type === "ScrollView")
        : null;
      expect(scrollView).toBeDefined();
    } else {
      throw new Error(
        "jsonTree is null, component did not render as expected.",
      );
    }
  });
});
