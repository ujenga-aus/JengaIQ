import { useMemo } from 'react';

function readVar(name: string, fallback: string) {
  const root = document.documentElement;
  return getComputedStyle(root).getPropertyValue(name).trim() || fallback;
}

export function useRechartsTheme() {
  return useMemo(() => {
    const axis = readVar('--axis-font-size', '12px');
    const title = readVar('--fs-h3', '16px');
    const label = readVar('--fs-data', '12px');
    
    return {
      axisStyle: { 
        fontSize: axis, 
        fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif' 
      },
      titleStyle: { 
        fontSize: title, 
        fontWeight: 600 
      },
      labelStyle: { 
        fontSize: label 
      },
    };
  }, []);
}
