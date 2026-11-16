import EmployeesClient from './employees/EmployeesClient'

// 従業員の入口は従業員一覧（旧メニュー画面は 2026-11-16 の新デザインでなくした）
export default function AdminStaffPage() {
  return <EmployeesClient />
}
