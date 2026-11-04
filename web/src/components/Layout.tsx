import { NavLink, Outlet } from 'react-router';
import { Avatar, MessageBar, MessageBarBody, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { PeopleQueueRegular, FlashRegular, PersonHeartRegular, FormNewRegular } from '@fluentui/react-icons';
import { useMe, usePublicConfig } from '../api';

const useStyles = makeStyles({
  shell: { minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: tokens.colorNeutralBackground2 },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXL,
    padding: `0 ${tokens.spacingHorizontalXL}`,
    height: '52px',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  brand: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  nav: { display: 'flex', gap: tokens.spacingHorizontalXS, flexGrow: 1 },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: tokens.colorNeutralForegroundOnBrand,
    textDecoration: 'none',
    padding: '6px 12px',
    borderRadius: tokens.borderRadiusMedium,
    ':hover': { backgroundColor: tokens.colorBrandBackgroundHover },
  },
  active: { backgroundColor: tokens.colorBrandBackgroundPressed },
  main: { padding: tokens.spacingHorizontalXL, maxWidth: '1440px', width: '100%', boxSizing: 'border-box', margin: '0 auto' },
});

const NAV = [
  { to: '/queue', label: 'Queue', icon: <PeopleQueueRegular /> },
  { to: '/auto-match', label: 'Auto-match', icon: <FlashRegular /> },
  { to: '/therapists', label: 'Therapists', icon: <PersonHeartRegular /> },
  { to: '/intake', label: 'Family intake form', icon: <FormNewRegular /> },
];

export function Layout() {
  const s = useStyles();
  const me = useMe();
  const config = usePublicConfig();
  return (
    <div className={s.shell}>
      <header className={s.header}>
        <div className={s.brand}>
          <img src="/favicon.svg" width={24} height={24} alt="" />
          SEEDS Intake
        </div>
        <nav className={s.nav}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => mergeClasses(s.link, isActive && s.active)}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        {me.data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>{me.data.name}</Text>
            <Avatar name={me.data.name} size={28} color="neutral" />
          </div>
        )}
      </header>
      {config.data?.authMode === 'demo' && <DemoBanner />}
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}

export const DemoBanner = () => (
  <MessageBar intent="warning" layout="singleline" shape="square">
    <MessageBarBody>
      <strong>Demo environment.</strong> All children, families and therapists are fictional. Do not enter real information.
    </MessageBarBody>
  </MessageBar>
);
