import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#18181B",
  surfaceSecondary: "#F4F4F5",
  onSurfaceSecondary: "#27272A",
  surfaceTertiary: "#E4E4E7",
  onSurfaceTertiary: "#3F3F46",
  surfaceInverse: "#18181B",
  onSurfaceInverse: "#FFFFFF",
  muted: "#71717A",

  brand: "#0F3E3A",
  onBrand: "#FFFFFF",
  brandPrimary: "#134E4A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#F0FDF4",
  onBrandSecondary: "#14532D",
  brandTertiary: "#E0F2FE",
  onBrandTertiary: "#0C4A6E",

  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  error: "#DC2626",
  onError: "#FFFFFF",
  info: "#0C4A6E",
  onInfo: "#FFFFFF",

  border: "#E4E4E7",
  borderStrong: "#D4D4D8",
  divider: "#F4F4F5",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const colors = themes.light;
