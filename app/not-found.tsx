// Unknown URLs, including the retired /login path, send the visitor to /claw.
import { redirect } from "next/navigation";

export default function NotFound() {
  redirect("/claw");
}
