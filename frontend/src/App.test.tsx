import { render, screen } from "@testing-library/react";
import App from "./App";

const heading = screen.getByText(/THIS SHOULD FAIL/i);

test("renders cloud infrastructure heading", () => {
  render(<App />);

  const heading = screen.getByText(/Cloud Infrastructure Project/i);

  expect(heading).toBeInTheDocument();
});