import { UpgradeGuide } from "@/components/content/upgrade-guide";
import { Mono, P, UL } from "@/components/content/prose";
import { guides } from "@/content/guides";
import { pageMetadata } from "@/lib/seo";

const g = guides.find((x) => x.path === "/laravel-12-to-13")!;

export const metadata = pageMetadata({ title: g.title, description: g.description, path: g.path });

export default function Laravel12To13Page() {
  return (
    <UpgradeGuide
      from={12}
      to={13}
      path={g.path}
      title={g.title}
      lede="What changes when a Laravel 12 app moves to 13, in the order you would do it. Every constraint and change below comes from the official upgrade guide, with the date we checked it."
      phpNote="Laravel 13 requires PHP 8.3 or newer, so an app on PHP 8.2 must raise its PHP version before or with this upgrade. Laravel 12 supports PHP 8.2 to 8.5."
      composerRows={[
        ["laravel/framework", "^13.0", "require"],
        ["laravel/boost", "^2.0", "Where already listed"],
        ["laravel/tinker", "^3.0", "Where already listed"],
        ["phpunit/phpunit", "^12.0", "require-dev"],
        ["pestphp/pest", "^4.0", "require-dev"],
      ]}
      steps={[
        {
          id: "php",
          title: "Raise the PHP minimum",
          body: (
            <P>
              Set the <Mono>php</Mono> constraint in composer.json to <Mono>^8.3</Mono> or higher, and make sure your host, your CI image and your local machines run PHP 8.3 or newer before you run{" "}
              <Mono>composer update</Mono>.
            </P>
          ),
        },
        {
          id: "csrf",
          title: "Rename the CSRF middleware references",
          body: (
            <P>
              The 13.x guide renames the CSRF middleware to <Mono>PreventRequestForgery</Mono>. The old names stay as deprecated aliases, so nothing breaks at once, but search your code and{" "}
              <Mono>bootstrap/app.php</Mono> for <Mono>VerifyCsrfToken</Mono> and plan the rename. The guide also adds a <Mono>preventRequestForgery(...)</Mono> middleware API.
            </P>
          ),
        },
        {
          id: "config",
          title: "Review the skeleton and config changes",
          body: (
            <>
              <P>
                The guide says skeleton changes are optional. You can compare your app with the new skeleton on GitHub. Two config changes matter because they change behavior:
              </P>
              <UL
                items={[
                  <>
                    <Mono>config/session.php</Mono>: the 13.x skeleton sets the session <Mono>serialization</Mono> option to <Mono>json</Mono>. Changing it from <Mono>php</Mono> invalidates every active session, so users sign in again. Keep <Mono>php</Mono> if you need sessions to survive the deploy.
                  </>,
                  <>
                    <Mono>config/cache.php</Mono>: the skeleton adds <Mono>serializable_classes</Mono> set to <Mono>false</Mono>. If your app stores PHP objects in the cache on purpose, list the allowed classes or move to array payloads.
                  </>,
                ]}
              />
            </>
          ),
        },
        {
          id: "verify",
          title: "Run the install, the build and the tests",
          body: (
            <P>
              After <Mono>composer update</Mono>, run <Mono>composer install</Mono> from a clean checkout, build your assets and run the whole test suite. A pull request that skips these steps can fail in CI for reasons you could have seen earlier. Packages not listed in the guide, such as Sail, Pint, Sanctum and Collision, may need a bump too. Check each one against its own release notes.
            </P>
          ),
        },
      ]}
      recipes={[
        "Update composer.json for Laravel 13: PHP 8.3 minimum, framework, Boost, Tinker, PHPUnit and Pest constraints as in the table above.",
        "Sync skeleton and config files with Laravel 13, as a three way merge. Conflicts keep your version and become squawks, including the session and cache notes above.",
        "Report the VerifyCsrfToken rename as a squawk. The guide does not show the exact replacement for every bootstrap/app.php setup, so we list it and change nothing automatically.",
      ]}
      oneOffKind="to_latest"
      sources={[
        { label: "Laravel 13.x upgrade guide", href: "https://laravel.com/docs/13.x/upgrade" },
        { label: "Laravel 13.x release notes and support policy", href: "https://laravel.com/docs/13.x/releases" },
        { label: "laravel/laravel skeleton changes, 12.x to 13.x", href: "https://github.com/laravel/laravel/compare/12.x...13.x" },
      ]}
      faq={[
        {
          q: "Does Laravel 13 need a newer PHP than Laravel 12?",
          a: "Yes. Laravel 13 requires PHP 8.3 or newer, according to the 13.x release notes. Laravel 12 supports PHP 8.2 to 8.5.",
        },
        {
          q: "Will the upgrade log my users out?",
          a: "It can. The 13.x skeleton sets session serialization to json, and changing it from php invalidates active sessions. Keep the php setting if you want sessions to continue.",
        },
        {
          q: "Do I have to update the skeleton files?",
          a: "No. The official guide calls skeleton changes optional. Stepclimb merges them for you as a separate commit and lists conflicts as squawks, so you can drop that commit if you prefer.",
        },
      ]}
    />
  );
}

