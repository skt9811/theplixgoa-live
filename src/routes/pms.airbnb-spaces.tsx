import { createFileRoute } from "@tanstack/react-router";
import { AirbnbSpacesView } from "@/components/pms/airbnb-spaces-view";

export const Route = createFileRoute("/pms/airbnb-spaces")({
  component: AirbnbSpacesView,
});
