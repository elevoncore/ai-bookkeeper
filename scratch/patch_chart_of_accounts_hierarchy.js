const fs = require('fs');

const coaPath = 'd:/build/ai-bookkeeper/src/components/dashboard/ChartOfAccountsManager.tsx';
let content = fs.readFileSync(coaPath, 'utf8');

// 1. Add CornerDownRight to lucide-react imports if missing
if (!content.includes('CornerDownRight,')) {
  content = content.replace(
    "import {\n  BookOpen,",
    "import {\n  BookOpen,\n  CornerDownRight,"
  ).replace(
    "import { \n  BookOpen,",
    "import { \n  BookOpen,\n  CornerDownRight,"
  );
}

// 2. Update AccountRow interface
content = content.replace(
  `interface AccountRow {
  id: string;
  name: string;
  code?: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_system: boolean;
  is_cash_account?: boolean;
  balance: number;
  total_debit: number;
  total_credit: number;
}`,
  `interface AccountRow {
  id: string;
  name: string;
  code?: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_system: boolean;
  is_cash_account?: boolean;
  balance: number;
  total_debit: number;
  total_credit: number;
  parent_account_id?: string | null;
  parent_id?: string | null;
}

interface HierarchicalAccountRow extends AccountRow {
  depth: number;
  isChild: boolean;
  hasChildren: boolean;
  parentName?: string;
}`
);

// 3. Fix isCash calculation in fetchAccountsWithBalances
const targetIsCash = `  const isCash = Boolean(a.is_cash_account) || 
  a.name === 'Main Bank Account' || 
  a.name === 'Petty Cash' || 
  a.name.toLowerCase().includes('bank') || 
  a.name.toLowerCase().includes('cash');

  return {
  id: a.id,
  name: a.name,
  code: a.code || '',
  type: a.type,
  is_system: Boolean(a.is_system),
  is_cash_account: isCash,
  balance: netCents / 100,
  total_debit: totals.debitCents / 100,
  total_credit: totals.creditCents / 100
  };`;

const replacementIsCash = `  // CRITICAL: Only assets can be cash accounts! Liabilities are debt, NEVER cash.
  const isCash = a.type === 'asset' && (
    Boolean(a.is_cash_account) || 
    a.name === 'Main Bank Account' || 
    a.name === 'Petty Cash'
  );

  return {
    id: a.id,
    name: a.name,
    code: a.code || '',
    type: a.type,
    is_system: Boolean(a.is_system),
    is_cash_account: isCash,
    balance: netCents / 100,
    total_debit: totals.debitCents / 100,
    total_credit: totals.creditCents / 100,
    parent_account_id: a.parent_account_id || a.parent_id || null,
    parent_id: a.parent_account_id || a.parent_id || null
  };`;

content = content.replace(targetIsCash, replacementIsCash);

// 4. Update groupedAccounts to build parent/child hierarchy
const targetGroupedAccounts = `  const groupedAccounts = useMemo(() => {
  const types: ('asset' | 'liability' | 'equity' | 'revenue' | 'expense')[] = [
  'asset', 'liability', 'equity', 'revenue', 'expense'
  ];

  const groupMap: Record<string, AccountRow[]> = {
  asset: [],
  liability: [],
  equity: [],
  revenue: [],
  expense: []
  };

  filteredAccounts.forEach(a => {
  if (groupMap[a.type]) {
  groupMap[a.type].push(a);
  }
  });

  const labels: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenues',
  expense: 'Expenses'
  };

  return types.map(t => {
  const items = [...groupMap[t]].sort((a, b) => {
  let comp = 0;
  if (sortField === 'name') comp = a.name.localeCompare(b.name);
  else if (sortField === 'type') comp = a.type.localeCompare(b.type);
  else if (sortField === 'balance') comp = (a.balance || 0) - (b.balance || 0);
  return sortOrder === 'asc' ? comp : -comp;
  });

  return {
  type: t,
  label: labels[t] || (t.charAt(0).toUpperCase() + t.slice(1)),
  items
  };
  });
  }, [filteredAccounts, sortField, sortOrder]);`;

const replacementGroupedAccounts = `  const groupedAccounts = useMemo(() => {
    const types: ('asset' | 'liability' | 'equity' | 'revenue' | 'expense')[] = [
      'asset', 'liability', 'equity', 'revenue', 'expense'
    ];

    const groupMap: Record<string, AccountRow[]> = {
      asset: [],
      liability: [],
      equity: [],
      revenue: [],
      expense: []
    };

    filteredAccounts.forEach(a => {
      if (groupMap[a.type]) {
        groupMap[a.type].push(a);
      }
    });

    const labels: Record<string, string> = {
      asset: 'Assets',
      liability: 'Liabilities',
      equity: 'Equity',
      revenue: 'Revenues',
      expense: 'Expenses'
    };

    return types.map(t => {
      const itemsInGroup = groupMap[t] || [];
      
      const sortHelper = (a: AccountRow, b: AccountRow) => {
        let comp = 0;
        if (sortField === 'name') comp = a.name.localeCompare(b.name);
        else if (sortField === 'type') comp = a.type.localeCompare(b.type);
        else if (sortField === 'balance') comp = (a.balance || 0) - (b.balance || 0);
        return sortOrder === 'asc' ? comp : -comp;
      };

      const hierarchicalItems: HierarchicalAccountRow[] = [];
      const parentAccounts = itemsInGroup.filter(a => !a.parent_account_id && !a.parent_id);
      parentAccounts.sort(sortHelper);

      const processedIds = new Set<string>();

      parentAccounts.forEach(parent => {
        const children = itemsInGroup.filter(c => (c.parent_account_id === parent.id || c.parent_id === parent.id) && c.id !== parent.id);
        children.sort(sortHelper);

        hierarchicalItems.push({
          ...parent,
          depth: 0,
          isChild: false,
          hasChildren: children.length > 0
        });
        processedIds.add(parent.id);

        children.forEach(child => {
          hierarchicalItems.push({
            ...child,
            depth: 1,
            isChild: true,
            hasChildren: false,
            parentName: parent.name
          });
          processedIds.add(child.id);
        });
      });

      // Include remaining/orphaned accounts
      itemsInGroup.forEach(acc => {
        if (!processedIds.has(acc.id)) {
          const parentAccount = accounts.find(a => a.id === (acc.parent_account_id || acc.parent_id));
          hierarchicalItems.push({
            ...acc,
            depth: parentAccount ? 1 : 0,
            isChild: !!parentAccount,
            hasChildren: false,
            parentName: parentAccount?.name
          });
        }
      });

      return {
        type: t,
        label: labels[t] || (t.charAt(0).toUpperCase() + t.slice(1)),
        items: hierarchicalItems
      };
    });
  }, [filteredAccounts, accounts, sortField, sortOrder]);`;

content = content.replace(targetGroupedAccounts, replacementGroupedAccounts);

// 5. Replace table row rendering
const targetTableRows = `  {group.items.map(acc => (
  <tr key={acc.id} className="hover:bg-white/60 transition-colors">
  <td className="px-6 py-3.5 font-bold text-gray-900 text-xs">
  <button
  onClick={() => handleOpenTAccount(acc)}
  className="hover:text-blue-600 hover:underline text-left cursor-pointer flex items-center gap-1.5 transition-colors group/name"
  title={\`Click to open T-Account Ledger for \${acc.name}\`}
  >
  <span>{acc.name}</span>
  {acc.code && <span className="text-[10px] text-gray-400 font-mono">({acc.code})</span>}
  </button>
  </td>
  <td className="px-6 py-3.5 text-xs">
  <span className={\`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border \${typeBadges[acc.type]}\`}>
  {acc.type}
  </span>
  </td>
  <td className="px-6 py-3.5 text-xs">
  {acc.is_cash_account ? (
  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
  <Landmark className="w-3 h-3" /> Yes (Cash/Bank)
  </span>
  ) : (
  <span className="text-gray-400 text-xs">-</span>
  )}
  </td>
  <td className="px-6 py-3.5 text-xs">
  {acc.is_system ? (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
  <ShieldCheck className="w-3 h-3" /> System
  </span>
  ) : (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
  <UserCheck className="w-3 h-3" /> Custom
  </span>
  )}
  </td>
  <td className="px-6 py-3.5 text-right font-black text-xs text-gray-900">
  {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] font-bold text-gray-500">PKR</span>
  </td>
  <td className="px-6 py-3.5 text-center text-xs">
  <div className="flex items-center justify-center gap-1">
  <button
  onClick={() => openEditModal(acc)}
  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
  title="Edit Account"
  >
  <Edit2 className="w-3.5 h-3.5" />
  </button>
  <button
  onClick={() => handleDeleteAccount(acc)}
  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
  title="Delete Account"
  >
  <Trash2 className="w-3.5 h-3.5" />
  </button>
  </div>
  </td>
  </tr>
  ))}`;

const replacementTableRows = `  {group.items.map(acc => (
    <tr 
      key={acc.id} 
      className={\`transition-colors \${
        acc.isChild 
          ? 'bg-slate-50/70 hover:bg-blue-50/50 border-l-4 border-l-blue-500' 
          : 'hover:bg-white/60'
      }\`}
    >
      <td className={\`py-3.5 text-xs font-bold text-gray-900 \${
        acc.isChild ? 'pl-10 sm:pl-12 pr-6' : 'px-6'
      }\`}>
        <div className="flex items-center gap-2">
          {acc.isChild && (
            <CornerDownRight className="w-3.5 h-3.5 text-blue-600 shrink-0 select-none" />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleOpenTAccount(acc)}
                className="hover:text-blue-600 hover:underline text-left cursor-pointer flex items-center gap-1.5 transition-colors group/name"
                title={\`Click to open T-Account Ledger for \${acc.name}\`}
              >
                <span className={acc.isChild ? 'font-semibold text-slate-800' : 'font-black text-slate-900'}>
                  {acc.name}
                </span>
                {acc.code && <span className="text-[10px] text-gray-400 font-mono">({acc.code})</span>}
              </button>
              {acc.hasChildren && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-tight uppercase bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
                  Control Category
                </span>
              )}
              {acc.isChild && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs">
                  Sub-Account
                </span>
              )}
            </div>
            {acc.isChild && acc.parentName && (
              <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                ↳ Sub-account of <strong className="text-slate-600 font-bold">{acc.parentName}</strong>
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-3.5 text-xs">
        <span className={\`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border \${typeBadges[acc.type]}\`}>
          {acc.type}
        </span>
      </td>
      <td className="px-6 py-3.5 text-xs">
        {acc.is_cash_account ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <Landmark className="w-3 h-3" /> Yes (Cash/Bank)
          </span>
        ) : (
          <span className="text-gray-400 text-xs">-</span>
        )}
      </td>
      <td className="px-6 py-3.5 text-xs">
        {acc.is_system ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
            <ShieldCheck className="w-3 h-3" /> System
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            <UserCheck className="w-3 h-3" /> Custom
          </span>
        )}
      </td>
      <td className="px-6 py-3.5 text-right font-black text-xs text-gray-900">
        {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] font-bold text-gray-500">PKR</span>
      </td>
      <td className="px-6 py-3.5 text-center text-xs">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => openEditModal(acc)}
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Edit Account"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDeleteAccount(acc)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Delete Account"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  ))}`;

content = content.replace(targetTableRows, replacementTableRows);

fs.writeFileSync(coaPath, content, 'utf8');
console.log("Successfully updated ChartOfAccountsManager.tsx!");
