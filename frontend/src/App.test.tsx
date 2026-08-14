import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders cloud infrastructure heading", () => {
  render(<App />);

  const heading = screen.getByText(/Cloud Infrastructure Project/i);

  expect(heading).toBeInTheDocument();
});