import { UpgradeGuide } from "@/components/content/upgrade-guide";
import { Mono, P } from "@/components/content/prose";
import { guides } from "@/content/guides";
import { pageMetadata } from "@/lib/seo";

const g = guides.find((x) => x.path === "/laravel-11-to-12")!;

export const metadata = pageMetadata({ title: g.title, description: g.description, path: g.path });

export default function Laravel11To12Page() {
  return (
    <UpgradeGuide
      from={11}
      to={12}
      path={g.path}
      title={g.title}
      lede="Laravel 11 stopped getting security fixes on 12 Mar 2026. This is what moving a Laravel 11 app to 12 involves, taken from the official upgrade guide, with the date we checked it."
      phpNote="Laravel 12 supports PHP 8.2 to 8.5, so most Laravel 11 apps do not need a PHP change for this step. PHP 8.2 itself gets security fixes until 31 Dec 2026."
      composerRows={[
        ["laravel/framework", "^12.0", "require"],
        ["phpunit/phpunit", "^11.0", "require-dev"],
        ["pestphp/pest", "^3.0", "require-dev"],
      ]}
      steps={[
        {
          id: "php",
          title: "Check the PHP version",
          body: (
            <P>
              Make sure the <Mono>php</Mono> constraint in composer.json allows 8.2 or newer, and that your host and CI run a PHP version Laravel 12 supports, from 8.2 to 8.5.
            </P>
          ),
        },
        {
          id: "skeleton",
          title: "Decide what to do about skeleton changes",
          body: (
            <P>
              The 12.x guide calls skeleton changes optional and points to the comparison of the 11.x and 12.x branches of laravel/laravel on GitHub. Read that diff for config files such as <Mono>config/session.php</Mono> and <Mono>bootstrap/app.php</Mono>, and take only the changes you want.
            </P>
          ),
        },
        {
          id: "verify",
          title: "Run the install, the build and the tests",
          body: (
            <P>
              After <Mono>composer update</Mono>, run <Mono>composer install</Mono> from a clean checkout, build your assets and run the whole test suite. Packages not listed in the guide, such as Tinker, Sail, Pint, Sanctum and Collision, may need a bump too. Check each one against its own release notes.
            </P>
          ),
        },
      ]}
      recipes={[
        "Update composer.json for Laravel 12: framework, PHPUnit and Pest constraints as in the table above, and a PHP minimum of at least 8.2.",
        "Sync skeleton and config files with Laravel 12, as a three way merge. Conflicts keep your version and become squawks.",
      ]}
      oneOffKind="to_previous"
      sources={[
        { label: "Laravel 12.x upgrade guide", href: "https://laravel.com/docs/12.x/upgrade" },
        { label: "Laravel 13.x release notes and support policy", href: "https://laravel.com/docs/13.x/releases" },
        { label: "laravel/laravel skeleton changes, 11.x to 12.x", href: "https://github.com/laravel/laravel/compare/11.x...12.x" },
        { label: "PHP supported versions", href: "https://www.php.net/supported-versions.php" },
      ]}
      faq={[
        {
          q: "Is Laravel 11 still supported?",
          a: "Security fixes for Laravel 11 ended on 12 Mar 2026, according to the Laravel release notes. An app that stays on 11 gets no further security fixes from the framework.",
        },
        {
          q: "Can I skip 12 and go straight to 13?",
          a: "You can plan the jump, but Laravel 13 needs PHP 8.3 or newer and each major has its own upgrade guide. Stepclimb applies one major at a time, one commit per change, so each step is reviewable.",
        },
        {
          q: "Do I have to update the skeleton files?",
          a: "No. The official guide calls skeleton changes optional. Stepclimb merges them in a separate commit and lists conflicts as squawks.",
        },
      ]}
    />
  );
}
