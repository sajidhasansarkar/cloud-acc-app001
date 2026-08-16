import { withAuth } from "next-auth/middleware";

// Protects everything under /dashboard, plus the /companies workspace added
// in Phase 2B-2A. Unauthenticated requests are redirected to /login (handled
// automatically by withAuth using pages.signIn from authOptions). All further
// authorization — role checks, organization scoping, and the Organization ->
// Company ownership check — happens server-side in requireActiveOrganization()
// and getOwnedCompany(), never here.
export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/companies/:path*"],
};
