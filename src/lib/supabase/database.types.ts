export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          actor_role: string | null
          at: string
          changed: string[] | null
          id: number
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role?: string | null
          at?: string
          changed?: string[] | null
          id?: never
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: string | null
          at?: string
          changed?: string[] | null
          id?: never
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      campaign_participants: {
        Row: {
          campaign_id: string
          created_at: string
          expected_amount: number | null
          member_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          expected_amount?: number | null
          member_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          expected_amount?: number | null
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_participants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "arrears"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "campaign_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          amount_mode: Database["public"]["Enums"]["campaign_mode"]
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          id: string
          purpose: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          surplus_action: Database["public"]["Enums"]["surplus_action"] | null
          target_amount: number | null
          title: string
        }
        Insert: {
          amount_mode: Database["public"]["Enums"]["campaign_mode"]
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          purpose?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          surplus_action?: Database["public"]["Enums"]["surplus_action"] | null
          target_amount?: number | null
          title: string
        }
        Update: {
          amount_mode?: Database["public"]["Enums"]["campaign_mode"]
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          purpose?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          surplus_action?: Database["public"]["Enums"]["surplus_action"] | null
          target_amount?: number | null
          title?: string
        }
        Relationships: []
      }
      committee: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          member_id: string | null
          role: Database["public"]["Enums"]["committee_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          member_id?: string | null
          role: Database["public"]["Enums"]["committee_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          member_id?: string | null
          role?: Database["public"]["Enums"]["committee_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "arrears"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "committee_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          campaign_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          receipt_path: string | null
          spent_on: string
        }
        Insert: {
          amount: number
          campaign_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          receipt_path?: string | null
          spent_on: string
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          receipt_path?: string | null
          spent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_accounts: {
        Row: {
          account_number: string
          active: boolean
          created_at: string
          created_by: string | null
          holder_name: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_number: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          holder_name: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_number?: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          holder_name?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      group_prices: {
        Row: {
          created_at: string
          group_id: number
          monthly_amount: number
          year: number
        }
        Insert: {
          created_at?: string
          group_id: number
          monthly_amount: number
          year: number
        }
        Update: {
          created_at?: string
          group_id?: number
          monthly_amount?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_prices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          code: string
          created_at: string
          id: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          note: string | null
          number: number
          phone: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          note?: string | null
          number: number
          phone?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          note?: string | null
          number?: number
          phone?: string | null
        }
        Relationships: []
      }
      membership_periods: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          from_month: string
          group_id: number
          id: string
          member_id: string
          reason: string | null
          status: Database["public"]["Enums"]["membership_status"]
          to_month: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          from_month: string
          group_id: number
          id?: string
          member_id: string
          reason?: string | null
          status: Database["public"]["Enums"]["membership_status"]
          to_month?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          from_month?: string
          group_id?: number
          id?: string
          member_id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          to_month?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_periods_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_periods_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "arrears"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "membership_periods_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          campaign_id: string | null
          id: string
          kind: Database["public"]["Enums"]["allocation_kind"]
          member_id: string | null
          month: number | null
          payment_id: string
          year: number | null
        }
        Insert: {
          amount: number
          campaign_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["allocation_kind"]
          member_id?: string | null
          month?: number | null
          payment_id: string
          year?: number | null
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["allocation_kind"]
          member_id?: string | null
          month?: number | null
          payment_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "arrears"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "payment_allocations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_months: {
        Row: {
          amount: number
          created_at: string
          member_id: string
          month: number
          payment_id: string
          released_at: string | null
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          member_id: string
          month: number
          payment_id: string
          released_at?: string | null
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          member_id?: string
          month?: number
          payment_id?: string
          released_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_months_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "arrears"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "payment_months_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_months_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_months_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          paid_on: string
          payer_name: string
          proof_hash: string | null
          proof_path: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
          txn_ref: string | null
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_on: string
          payer_name: string
          proof_hash?: string | null
          proof_path?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          txn_ref?: string | null
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_on?: string
          payer_name?: string
          proof_hash?: string | null
          proof_path?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          txn_ref?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          campaign_id: string | null
          channel: string
          id: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          member_id: string | null
          payment_id: string | null
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel?: string
          id?: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          member_id?: string | null
          payment_id?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: string
          id?: string
          kind?: Database["public"]["Enums"]["reminder_kind"]
          member_id?: string | null
          payment_id?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "arrears"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "reminders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          grace_days: number
          id: boolean
          opening_balance: number
          opening_balance_on: string
          show_amount_owed: boolean
          updated_at: string
          updated_by: string | null
          whatsapp_contact: string | null
        }
        Insert: {
          grace_days?: number
          id?: boolean
          opening_balance?: number
          opening_balance_on?: string
          show_amount_owed?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_contact?: string | null
        }
        Update: {
          grace_days?: number
          id?: boolean
          opening_balance?: number
          opening_balance_on?: string
          show_amount_owed?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_contact?: string | null
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          from_campaign_id: string
          id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_campaign_id: string
          id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          from_campaign_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_campaign_id_fkey"
            columns: ["from_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      activity_feed: {
        Row: {
          amount: number | null
          at: string | null
          category: Database["public"]["Enums"]["expense_category"] | null
          kind: string | null
          member_names: string | null
          months: number | null
        }
        Relationships: []
      }
      arrears: {
        Row: {
          amount_owed: number | null
          credit: number | null
          full_name: string | null
          group_code: string | null
          last_reminded_at: string | null
          member_id: string | null
          member_status: Database["public"]["Enums"]["membership_status"] | null
          months: string[] | null
          months_count: number | null
          number: number | null
          phone: string | null
        }
        Relationships: []
      }
      campaign_progress: {
        Row: {
          amount_mode: Database["public"]["Enums"]["campaign_mode"] | null
          balance: number | null
          campaign_id: string | null
          collected: number | null
          deadline: string | null
          participants: number | null
          participants_paid: number | null
          purpose: string | null
          spent: number | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          target_amount: number | null
          title: string | null
          transferred: number | null
        }
        Relationships: []
      }
      expense_totals: {
        Row: {
          category: Database["public"]["Enums"]["expense_category"] | null
          total: number | null
          year: number | null
        }
        Relationships: []
      }
      fund_accounts_public: {
        Row: {
          account_number: string | null
          holder_name: string | null
          id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          sort_order: number | null
        }
        Relationships: []
      }
      fund_info: {
        Row: {
          grace_days: number | null
          show_amount_owed: boolean | null
          whatsapp_contact: string | null
        }
        Relationships: []
      }
      fund_summary: {
        Row: {
          balance: number | null
          collected_this_year: number | null
          last_activity_at: string | null
          members_behind: number | null
          members_ok: number | null
          money_in: number | null
          money_out: number | null
          opening_balance: number | null
          spent_this_year: number | null
          transfers_in: number | null
        }
        Relationships: []
      }
      keepalive: {
        Row: {
          groups: number | null
          ok: boolean | null
        }
        Relationships: []
      }
      member_months: {
        Row: {
          member_id: string | null
          month: number | null
          state: string | null
          year: number | null
        }
        Relationships: []
      }
      member_status: {
        Row: {
          amount_owed: number | null
          full_name: string | null
          group_code: string | null
          member_id: string | null
          member_status: Database["public"]["Enums"]["membership_status"] | null
          months_behind: number | null
          months_paid_this_year: number | null
          number: number | null
          status_label: string | null
        }
        Relationships: []
      }
      monthly_collection: {
        Row: {
          collected: number | null
          expected: number | null
          month: number | null
          year: number | null
        }
        Relationships: []
      }
      payment_queue: {
        Row: {
          allocations: Json | null
          amount: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          note: string | null
          paid_on: string | null
          payer_name: string | null
          proof_path: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          txn_ref: string | null
        }
        Relationships: []
      }
      recent_expenses: {
        Row: {
          amount: number | null
          campaign_id: string | null
          category: Database["public"]["Enums"]["expense_category"] | null
          id: string | null
          note: string | null
          spent_on: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_fund_account: {
        Args: {
          p_account_number: string
          p_holder_name: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_sort_order?: number
        }
        Returns: string
      }
      add_member: {
        Args: {
          p_from_month: string
          p_full_name: string
          p_group_code: string
          p_note?: string
          p_number: number
          p_phone?: string
          p_status?: Database["public"]["Enums"]["membership_status"]
        }
        Returns: string
      }
      cancel_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      change_member_status: {
        Args: {
          p_from_month: string
          p_group_code?: string
          p_member_id: string
          p_reason: string
          p_status: Database["public"]["Enums"]["membership_status"]
        }
        Returns: string
      }
      confirm_payment: { Args: { p_payment_id: string }; Returns: Json }
      log_reminder: {
        Args: {
          p_campaign_id?: string
          p_kind: Database["public"]["Enums"]["reminder_kind"]
          p_member_id?: string
          p_payment_id?: string
        }
        Returns: string
      }
      record_expense: {
        Args: {
          p_amount: number
          p_campaign_id?: string
          p_category: Database["public"]["Enums"]["expense_category"]
          p_id: string
          p_note?: string
          p_receipt_path?: string
          p_spent_on: string
        }
        Returns: string
      }
      record_payment: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_paid_on: string
          p_payer_name: string
          p_proof_hash?: string
          p_proof_path?: string
          p_txn_ref?: string
        }
        Returns: Json
      }
      reject_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      set_committee_member: {
        Args: {
          p_active?: boolean
          p_display_name: string
          p_member_id?: string
          p_role: Database["public"]["Enums"]["committee_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      set_group_price: {
        Args: { p_group_code: string; p_monthly_amount: number; p_year: number }
        Returns: undefined
      }
      undo_payment: { Args: { p_payment_id: string }; Returns: undefined }
      update_fund_account: {
        Args: {
          p_active: boolean
          p_holder_name: string
          p_id: string
          p_note: string
          p_sort_order: number
        }
        Returns: undefined
      }
      update_member: {
        Args: {
          p_full_name: string
          p_member_id: string
          p_note: string
          p_phone: string
        }
        Returns: undefined
      }
      update_settings: {
        Args: {
          p_grace_days?: number
          p_opening_balance?: number
          p_opening_balance_on?: string
          p_show_amount_owed?: boolean
          p_whatsapp_contact?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      allocation_kind: "months" | "campaign" | "credit"
      campaign_mode: "fixed" | "per_group" | "custom" | "open"
      campaign_status: "open" | "closed"
      committee_role: "admin" | "treasurer" | "deputy" | "committee"
      expense_category: "teaching" | "honoring" | "sports" | "other"
      membership_status: "active" | "exempt" | "away" | "left" | "deceased"
      payment_method:
        | "bankily"
        | "masrvi"
        | "sedad"
        | "click"
        | "bim"
        | "amanty"
        | "bamis"
        | "cash"
        | "other"
        | "paper"
      payment_status: "pending" | "confirmed" | "rejected" | "cancelled"
      reminder_kind: "individual" | "group" | "receipt" | "campaign"
      surplus_action: "to_fund" | "keep"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      allocation_kind: ["months", "campaign", "credit"],
      campaign_mode: ["fixed", "per_group", "custom", "open"],
      campaign_status: ["open", "closed"],
      committee_role: ["admin", "treasurer", "deputy", "committee"],
      expense_category: ["teaching", "honoring", "sports", "other"],
      membership_status: ["active", "exempt", "away", "left", "deceased"],
      payment_method: [
        "bankily",
        "masrvi",
        "sedad",
        "click",
        "bim",
        "amanty",
        "bamis",
        "cash",
        "other",
        "paper",
      ],
      payment_status: ["pending", "confirmed", "rejected", "cancelled"],
      reminder_kind: ["individual", "group", "receipt", "campaign"],
      surplus_action: ["to_fund", "keep"],
    },
  },
} as const
