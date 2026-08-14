import type { Metadata } from "next";
import App from "@/src/App";

export const metadata: Metadata = {
  title: "Stillpoint — Local RSVP Reader",
  description: "A private, local-first RSVP speed reader for plain-text books.",
};

export default function Home() {
  return <App />;
}
