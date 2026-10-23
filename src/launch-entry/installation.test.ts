import { expect, test } from 'vitest';
import { installationLink } from './installation';
test('only the configured Apple distribution link becomes a download button', () => {
 expect(installationLink('https://apps.apple.com/us/app/spotted/id6760576197')?.label).toBe('Download on the App Store');
 expect(installationLink('https://testflight.apple.com/join/UjWqvyCX')?.label).toBe('Get Spotted on TestFlight');
 for (const value of [null, '', 'javascript:alert(1)', 'https://evil.example/a', 'https://apps.apple.com.evil.example/a', 'https://user@apps.apple.com/a', 'https://apps.apple.com:444/a']) expect(installationLink(value)).toBeNull();
});
