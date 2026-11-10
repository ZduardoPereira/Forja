import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text as RNText,
  type TextProps,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { absoluteUrl } from '@/lib/api';
import { errorText, initials } from '@/lib/format';
import type { FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CONTENT_MAX, font, radius, space, type, type TypeVariant, WIDE } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Text({ variant = 'body', muted, faint, color, style, ...rest }: TextProps & { variant?: TypeVariant; muted?: boolean; faint?: boolean; color?: string }) {
  const { c } = useTheme();
  return <RNText {...rest} style={[type[variant], { color: color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text) }, style]} />;
}

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Feather name={name} size={size} color={color ?? c.text} />;
}

export const useWide = () => useWindowDimensions().width >= WIDE;

/** Tela rolável com largura de leitura limitada e margens que respiram. */
export function Screen({ children, refreshing, onRefresh, scroll = true, tab }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; scroll?: boolean; tab?: boolean }) {
  const { c } = useTheme();
  const wide = useWide();
  const pad = wide ? space.xxl : space.lg;
  const inner = { width: '100%' as const, maxWidth: CONTENT_MAX, alignSelf: 'center' as const, padding: pad, gap: space.xl, paddingBottom: tab ? space.xxl : space.xxxl * 2 };
  return (
    <SafeAreaView edges={tab ? ['top'] : ['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.textMuted} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress, label, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string; padded?: boolean }) {
  const { c } = useTheme();
  const base = [{ backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, gap: space.md }, padded && { padding: space.lg }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [base, (pressed || hovered) && { backgroundColor: c.surfaceAlt }]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <Text variant="caption" muted accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/** Célula de uma linha de campos: divide a largura e quebra para baixo em telas estreitas. */
export function Cell({ children, basis = 140 }: { children: ReactNode; basis?: number }) {
  return <View style={{ flexGrow: 1, flexBasis: basis, minWidth: 0 }}>{children}</View>;
}

export function Row({ children, gap = space.sm, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { c } = useTheme();
  const bg = { primary: c.primary, accent: c.accent, secondary: c.surfaceAlt, ghost: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: c.onPrimary, accent: c.onAccent, secondary: c.text, ghost: c.text, danger: c.danger }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          minHeight: small ? 36 : 46,
          paddingHorizontal: small ? space.md : space.lg,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: kind === 'danger' || kind === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: kind === 'danger' ? c.danger : c.border,
          opacity: off ? 0.45 : pressed ? 0.8 : hovered ? 0.9 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} color={fg} size={small ? 15 : 17} /> : null}
      <Text variant={small ? 'small' : 'bodyStrong'} color={fg} style={{ fontFamily: font.semibold }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, size = 20, badge }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number; badge?: number }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={({ pressed }) => ({ padding: 8, borderRadius: radius.pill, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} color={color} size={size} />
      {badge ? (
        <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text variant="caption" color={c.onAccent} style={{ fontSize: 9, letterSpacing: 0 }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" muted>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textFaint}
        style={[
          type.body,
          { color: c.text, backgroundColor: c.surface, borderColor: error ? c.danger : c.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 46, paddingVertical: 10 },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="small" color={c.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" faint>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: radius.sm, backgroundColor: active ? c.surface : 'transparent' }}
          >
            <Text variant="small" color={active ? c.text : c.textMuted} style={{ fontFamily: active ? font.semibold : font.medium }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'radio' : 'text'}
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space.md,
        minHeight: 34,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? c.text : c.border,
        backgroundColor: selected ? c.text : 'transparent',
      }}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? c.bg : c.textMuted} /> : null}
      <Text variant="small" color={selected ? c.bg : c.text} style={{ fontFamily: font.medium }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Chips em uma linha: rolam na horizontal no celular e quebram linha no PC (sem arrastar com o mouse). */
export function ChipStrip({ children }: { children: ReactNode }) {
  const wide = useWide();
  if (wide) return <Row wrap>{children}</Row>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <Row wrap>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </Row>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }) {
  const { c } = useTheme();
  const fg = { neutral: c.textMuted, accent: c.accent, success: c.success, danger: c.danger, warning: c.warning }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: tone === 'accent' ? c.accentSoft : c.surfaceAlt }}>
      <Text variant="caption" color={fg} style={{ letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({ name, file, size = 36, online }: { name: string; file?: FileRef | null; size?: number; online?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      {file ? (
        <Image source={{ uri: absoluteUrl(file.thumbUrl) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceAlt }} contentFit="cover" accessibilityLabel={`Foto de ${name}`} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.semibold, fontSize: size * 0.38 }} color={c.accent}>
            {initials(name)}
          </Text>
        </View>
      )}
      {online ? <View style={{ position: 'absolute', right: 0, bottom: 0, width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: c.success, borderWidth: 2, borderColor: c.bg }} /> : null}
    </View>
  );
}

export function ListItem({ title, subtitle, left, right, onPress, testID }: { title: string; subtitle?: string | null; left?: ReactNode; right?: ReactNode; onPress?: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52, borderRadius: radius.sm, opacity: pressed ? 0.7 : 1, backgroundColor: hovered && onPress ? c.surfaceAlt : 'transparent' })}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" muted numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" color={c.textFaint} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string | null }) {
  return (
    <View style={{ flex: 1, minWidth: 120, gap: 4 }} accessible accessibilityLabel={`${label}: ${value} ${unit ?? ''}. ${hint ?? ''}`}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Row gap={4} style={{ alignItems: 'baseline' }}>
        <Text variant="metric">{value}</Text>
        {unit ? <Text muted>{unit}</Text> : null}
      </Row>
      {hint ? (
        <Text variant="small" faint>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.md }} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={c.textMuted} />
    </View>
  );
}

export function Empty({ icon = 'inbox', title, message, action }: { icon?: IconName; title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  const { c } = useTheme();
  return (
    <View testID="empty" style={{ paddingVertical: space.xl, alignItems: 'center', gap: space.sm }}>
      <Icon name={icon} size={26} color={c.textFaint} />
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message ? (
        <Text muted style={{ textAlign: 'center', maxWidth: 420 }}>
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} kind="secondary" small style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <View testID="error" style={{ paddingVertical: space.xl, alignItems: 'center', gap: space.sm }} accessibilityLiveRegion="polite">
      <Icon name="alert-circle" size={24} color={c.danger} />
      <Text style={{ textAlign: 'center' }}>{errorText(error)}</Text>
      {onRetry ? <Button title="Tentar de novo" onPress={onRetry} kind="secondary" small /> : null}
    </View>
  );
}

export function Grid({ children, min = 260 }: { children: ReactNode; min?: number }) {
  const { width } = useWindowDimensions();
  const cols = Math.max(1, Math.min(3, Math.floor(Math.min(width, CONTENT_MAX) / min)));
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{Array.isArray(children) ? children.map((ch, i) => <View key={i} style={{ flexBasis: `${100 / cols - 2}%`, flexGrow: 1 }}>{ch}</View>) : children}</View>;
}
