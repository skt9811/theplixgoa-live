import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pms/pos/manage")({ component: () => <Outlet /> });
