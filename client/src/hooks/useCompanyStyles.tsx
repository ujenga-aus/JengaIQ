import { useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';

/**
 * Hook that injects company-specific styling into the DOM as CSS custom properties.
 * This allows all tables, forms, and components throughout the app to use the
 * company's branded colors automatically.
 * 
 * Injected CSS variables:
 * - --table-header-bg, --table-header-fg: Table header colors
 * - --locked-column-bg, --locked-column-fg: Locked column colors (contract review)
 * - --form-bg, --form-border, --form-accent: Form/dialog colors
 * 
 * Colors automatically adapt to dark mode by inverting lightness values.
 */
export function useCompanyStyles() {
  const { selectedCompany } = useCompany();

  useEffect(() => {
    if (!selectedCompany) return;

    const root = document.documentElement;
    
    // Convert hex colors to HSL for Tailwind compatibility
    const hexToHSL = (hex: string): { h: number; s: number; l: number; hslString: string } => {
      // Remove # if present
      hex = hex.replace(/^#/, '');
      
      // Parse hex values
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      h = Math.round(h * 360);
      s = Math.round(s * 100);
      l = Math.round(l * 100);
      
      return {
        h,
        s,
        l,
        hslString: `${h} ${s}% ${l}%`
      };
    };

    // Adapt colors for dark mode by inverting lightness
    const adaptForDarkMode = (hsl: { h: number; s: number; l: number }): string => {
      const isDark = root.classList.contains('dark');
      if (!isDark) {
        return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
      }
      
      // For dark mode, invert the lightness (100 - l) but keep it in a reasonable range
      // Light backgrounds become dark, dark text becomes light
      let darkL = 100 - hsl.l;
      
      // Clamp lightness to usable ranges for dark mode
      // Backgrounds: 10-25%, Foregrounds: 75-95%
      if (hsl.l > 50) {
        // Was a light color (background) -> make it dark (10-25%)
        darkL = Math.max(10, Math.min(25, darkL));
      } else {
        // Was a dark color (text) -> make it light (75-95%)
        darkL = Math.max(75, Math.min(95, darkL));
      }
      
      return `${hsl.h} ${hsl.s}% ${darkL}%`;
    };

    // Set all company-specific colors as CSS custom properties
    const applyColors = () => {
      try {
        // Table header colors
        const tableHeaderBg = selectedCompany.tableHeaderBg || '#f1f5f9';
        const tableHeaderFg = selectedCompany.tableHeaderFg || '#0f172a';
        const tableHeaderBgHSL = hexToHSL(tableHeaderBg);
        const tableHeaderFgHSL = hexToHSL(tableHeaderFg);
        root.style.setProperty('--table-header-bg', adaptForDarkMode(tableHeaderBgHSL));
        root.style.setProperty('--table-header-fg', adaptForDarkMode(tableHeaderFgHSL));

        // Locked column colors (for contract review tables)
        const lockedColumnBg = selectedCompany.lockedColumnBg || '#fef3c7';
        const lockedColumnFg = selectedCompany.lockedColumnFg || '#78350f';
        const lockedColumnBgHSL = hexToHSL(lockedColumnBg);
        const lockedColumnFgHSL = hexToHSL(lockedColumnFg);
        root.style.setProperty('--locked-column-bg', adaptForDarkMode(lockedColumnBgHSL));
        root.style.setProperty('--locked-column-fg', adaptForDarkMode(lockedColumnFgHSL));

        // Form/dialog colors
        const formBg = selectedCompany.formBg || '#ffffff';
        const formBorder = selectedCompany.formBorder || '#e2e8f0';
        const formAccent = selectedCompany.formAccent || '#3b82f6';
        const formBgHSL = hexToHSL(formBg);
        const formBorderHSL = hexToHSL(formBorder);
        const formAccentHSL = hexToHSL(formAccent);
        root.style.setProperty('--form-bg', adaptForDarkMode(formBgHSL));
        root.style.setProperty('--form-border', adaptForDarkMode(formBorderHSL));
        root.style.setProperty('--form-accent', adaptForDarkMode(formAccentHSL));
      } catch (error) {
        console.error('Failed to set company style colors:', error);
        // Fallback to defaults on error - these will also adapt to dark mode
        const isDark = root.classList.contains('dark');
        if (isDark) {
          root.style.setProperty('--table-header-bg', '220 12% 18%');
          root.style.setProperty('--table-header-fg', '0 0% 95%');
          root.style.setProperty('--locked-column-bg', '32 95% 27%');
          root.style.setProperty('--locked-column-fg', '45 93% 88%');
          root.style.setProperty('--form-bg', '220 13% 15%');
          root.style.setProperty('--form-border', '220 12% 20%');
          root.style.setProperty('--form-accent', '217 91% 60%');
        } else {
          root.style.setProperty('--table-header-bg', '220 10% 95%');
          root.style.setProperty('--table-header-fg', '220 20% 15%');
          root.style.setProperty('--locked-column-bg', '45 93% 88%');
          root.style.setProperty('--locked-column-fg', '32 95% 27%');
          root.style.setProperty('--form-bg', '0 0% 100%');
          root.style.setProperty('--form-border', '214 32% 91%');
          root.style.setProperty('--form-accent', '217 91% 60%');
        }
      }
    };

    // Apply colors initially
    applyColors();

    // Listen for theme changes and reapply colors
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          applyColors();
        }
      });
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Cleanup when company changes or component unmounts
    return () => {
      observer.disconnect();
      root.style.removeProperty('--table-header-bg');
      root.style.removeProperty('--table-header-fg');
      root.style.removeProperty('--locked-column-bg');
      root.style.removeProperty('--locked-column-fg');
      root.style.removeProperty('--form-bg');
      root.style.removeProperty('--form-border');
      root.style.removeProperty('--form-accent');
    };
  }, [selectedCompany]);
}
