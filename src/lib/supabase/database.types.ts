// Generated from the live Supabase project (stock-intel). Regenerate after schema changes.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_list: {
        Row: {
          display_name: string | null
          email: string
          invited_at: string
          invited_by: string | null
          note: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["access_role"]
        }
        Insert: {
          display_name?: string | null
          email: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["access_role"]
        }
        Update: {
          display_name?: string | null
          email?: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["access_role"]
        }
        Relationships: [
          {
            foreignKeyName: "access_list_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          base_currency: string
          brokerage_connection_id: string | null
          cash_balance: number
          cash_balance_as_of: string | null
          created_at: string
          external_account_id: string | null
          id: string
          institution: string | null
          is_archived: boolean
          name: string
          source: Database["public"]["Enums"]["account_source"]
          tracking_mode: Database["public"]["Enums"]["tracking_mode"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          base_currency?: string
          brokerage_connection_id?: string | null
          cash_balance?: number
          cash_balance_as_of?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          institution?: string | null
          is_archived?: boolean
          name: string
          source?: Database["public"]["Enums"]["account_source"]
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          base_currency?: string
          brokerage_connection_id?: string | null
          cash_balance?: number
          cash_balance_as_of?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          institution?: string | null
          is_archived?: boolean
          name?: string
          source?: Database["public"]["Enums"]["account_source"]
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_brokerage_connection_id_fkey"
            columns: ["brokerage_connection_id"]
            isOneToOne: false
            referencedRelation: "brokerage_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          grounding: Json | null
          id: number
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          role: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          grounding?: Json | null
          id?: never
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          role: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          grounding?: Json | null
          id?: never
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          acknowledged_at: string | null
          alert_id: string
          id: number
          message: string
          observed: Json
          triggered_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_id: string
          id?: never
          message: string
          observed: Json
          triggered_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_id?: string
          id?: never
          message?: string
          observed?: Json
          triggered_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_type: string
          company_id: string | null
          condition: Json
          cooldown_hours: number
          created_at: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          notify_email: boolean
          user_id: string
        }
        Insert: {
          alert_type: string
          company_id?: string | null
          condition: Json
          cooldown_hours?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          notify_email?: boolean
          user_id: string
        }
        Update: {
          alert_type?: string
          company_id?: string | null
          condition?: Json
          cooldown_hours?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          notify_email?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analyst_estimates: {
        Row: {
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          ebitda_avg: number | null
          eps_avg: number | null
          eps_high: number | null
          eps_low: number | null
          fetched_at: string
          fiscal_period_end: string
          id: number
          ingested_job_id: string | null
          net_income_avg: number | null
          num_analysts_eps: number | null
          num_analysts_revenue: number | null
          period: Database["public"]["Enums"]["statement_period"]
          revenue_avg: number | null
          revenue_high: number | null
          revenue_low: number | null
          snapshot_date: string
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref: string | null
        }
        Insert: {
          company_id: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          ebitda_avg?: number | null
          eps_avg?: number | null
          eps_high?: number | null
          eps_low?: number | null
          fetched_at?: string
          fiscal_period_end: string
          id?: never
          ingested_job_id?: string | null
          net_income_avg?: number | null
          num_analysts_eps?: number | null
          num_analysts_revenue?: number | null
          period: Database["public"]["Enums"]["statement_period"]
          revenue_avg?: number | null
          revenue_high?: number | null
          revenue_low?: number | null
          snapshot_date: string
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
        }
        Update: {
          company_id?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          ebitda_avg?: number | null
          eps_avg?: number | null
          eps_high?: number | null
          eps_low?: number | null
          fetched_at?: string
          fiscal_period_end?: string
          id?: never
          ingested_job_id?: string | null
          net_income_avg?: number | null
          num_analysts_eps?: number | null
          num_analysts_revenue?: number | null
          period?: Database["public"]["Enums"]["statement_period"]
          revenue_avg?: number | null
          revenue_high?: number | null
          revenue_low?: number | null
          snapshot_date?: string
          source_provider?: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyst_estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      analyst_ratings: {
        Row: {
          action: string | null
          action_date: string
          company_id: string
          fetched_at: string
          firm: string
          from_grade: string | null
          id: number
          source_provider: Database["public"]["Enums"]["provider_id"]
          to_grade: string | null
        }
        Insert: {
          action?: string | null
          action_date: string
          company_id: string
          fetched_at?: string
          firm: string
          from_grade?: string | null
          id?: never
          source_provider: Database["public"]["Enums"]["provider_id"]
          to_grade?: string | null
        }
        Update: {
          action?: string | null
          action_date?: string
          company_id?: string
          fetched_at?: string
          firm?: string
          from_grade?: string | null
          id?: never
          source_provider?: Database["public"]["Enums"]["provider_id"]
          to_grade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyst_ratings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brokerage_connections: {
        Row: {
          access_token_cipher: string | null
          created_at: string
          external_item_id: string | null
          id: string
          institution_name: string | null
          last_error: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["provider_id"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_cipher?: string | null
          created_at?: string
          external_item_id?: string | null
          id?: string
          institution_name?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["provider_id"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_cipher?: string | null
          created_at?: string
          external_item_id?: string | null
          id?: string
          institution_name?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["provider_id"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brokerage_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      change_events: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          details: Json
          detected_on: string
          from_value: number | null
          id: number
          magnitude: number | null
          metric_key: string | null
          severity: number
          to_value: number | null
          user_id: string | null
          window_label: string
        }
        Insert: {
          category: string
          company_id?: string | null
          created_at?: string
          details?: Json
          detected_on: string
          from_value?: number | null
          id?: never
          magnitude?: number | null
          metric_key?: string | null
          severity?: number
          to_value?: number | null
          user_id?: string | null
          window_label: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          details?: Json
          detected_on?: string
          from_value?: number | null
          id?: never
          magnitude?: number | null
          metric_key?: string | null
          severity?: number
          to_value?: number | null
          user_id?: string | null
          window_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          asset_class: Database["public"]["Enums"]["asset_class"]
          cik: string | null
          country: string | null
          created_at: string
          currency: string | null
          cusip: string | null
          description: string | null
          employees: number | null
          exchange: string | null
          fetched_at: string | null
          id: string
          industry: string | null
          ipo_date: string | null
          is_active: boolean
          isin: string | null
          name: string | null
          sector: string | null
          security_type: Database["public"]["Enums"]["security_type"]
          source_provider: Database["public"]["Enums"]["provider_id"] | null
          source_ref: string | null
          symbol: string
          updated_at: string
          website: string | null
        }
        Insert: {
          asset_class?: Database["public"]["Enums"]["asset_class"]
          cik?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          cusip?: string | null
          description?: string | null
          employees?: number | null
          exchange?: string | null
          fetched_at?: string | null
          id?: string
          industry?: string | null
          ipo_date?: string | null
          is_active?: boolean
          isin?: string | null
          name?: string | null
          sector?: string | null
          security_type?: Database["public"]["Enums"]["security_type"]
          source_provider?: Database["public"]["Enums"]["provider_id"] | null
          source_ref?: string | null
          symbol: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          asset_class?: Database["public"]["Enums"]["asset_class"]
          cik?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          cusip?: string | null
          description?: string | null
          employees?: number | null
          exchange?: string | null
          fetched_at?: string | null
          id?: string
          industry?: string | null
          ipo_date?: string | null
          is_active?: boolean
          isin?: string | null
          name?: string | null
          sector?: string | null
          security_type?: Database["public"]["Enums"]["security_type"]
          source_provider?: Database["public"]["Enums"]["provider_id"] | null
          source_ref?: string | null
          symbol?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_events: {
        Row: {
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          dedupe_key: string
          details: Json
          event_date: string
          event_time: string | null
          event_type: string
          fetched_at: string
          id: number
          ingested_job_id: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          title: string | null
          url: string | null
        }
        Insert: {
          company_id: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          dedupe_key: string
          details?: Json
          event_date: string
          event_time?: string | null
          event_type: string
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          title?: string | null
          url?: string | null
        }
        Update: {
          company_id?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          dedupe_key?: string
          details?: Json
          event_date?: string
          event_time?: string | null
          event_type?: string
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_executives: {
        Row: {
          company_id: string
          fetched_at: string
          id: number
          name: string
          pay: number | null
          pay_currency: string | null
          since_year: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          title: string | null
        }
        Insert: {
          company_id: string
          fetched_at?: string
          id?: never
          name: string
          pay?: number | null
          pay_currency?: string | null
          since_year?: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          title?: string | null
        }
        Update: {
          company_id?: string
          fetched_at?: string
          id?: never
          name?: string
          pay?: number | null
          pay_currency?: string | null
          since_year?: number | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_executives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_peers: {
        Row: {
          company_id: string
          fetched_at: string
          method: string
          peer_company_id: string
          rank: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
        }
        Insert: {
          company_id: string
          fetched_at?: string
          method?: string
          peer_company_id: string
          rank?: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
        }
        Update: {
          company_id?: string
          fetched_at?: string
          method?: string
          peer_company_id?: string
          rank?: number | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
        }
        Relationships: [
          {
            foreignKeyName: "company_peers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_peers_peer_company_id_fkey"
            columns: ["peer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefs: {
        Row: {
          action_board: Json
          brief_date: string
          created_at: string
          data_freshness: Json
          fact_hash: string | null
          id: string
          job_run_id: string | null
          model: string | null
          narrative: Json | null
          no_action_today: boolean
          sections: Json
          status: string
          user_id: string
        }
        Insert: {
          action_board?: Json
          brief_date: string
          created_at?: string
          data_freshness?: Json
          fact_hash?: string | null
          id?: string
          job_run_id?: string | null
          model?: string | null
          narrative?: Json | null
          no_action_today?: boolean
          sections: Json
          status?: string
          user_id: string
        }
        Update: {
          action_board?: Json
          brief_date?: string
          created_at?: string
          data_freshness?: Json
          fact_hash?: string | null
          id?: string
          job_run_id?: string | null
          model?: string | null
          narrative?: Json | null
          no_action_today?: boolean
          sections?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_freshness_sla: {
        Row: {
          category: string
          critical_age_hours: number
          dataset: string
          label: string
          max_age_hours: number
        }
        Insert: {
          category: string
          critical_age_hours: number
          dataset: string
          label: string
          max_age_hours: number
        }
        Update: {
          category?: string
          critical_age_hours?: number
          dataset?: string
          label?: string
          max_age_hours?: number
        }
        Relationships: []
      }
      financial_metrics: {
        Row: {
          as_of: string
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          fetched_at: string
          id: number
          ingested_job_id: string | null
          inputs: Json | null
          metric_key: string
          period: Database["public"]["Enums"]["statement_period"]
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref: string | null
          unit: string
          value: number | null
        }
        Insert: {
          as_of: string
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          inputs?: Json | null
          metric_key: string
          period: Database["public"]["Enums"]["statement_period"]
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          unit?: string
          value?: number | null
        }
        Update: {
          as_of?: string
          company_id?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          inputs?: Json | null
          metric_key?: string
          period?: Database["public"]["Enums"]["statement_period"]
          source_provider?: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          unit?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_statements: {
        Row: {
          company_id: string
          currency: string | null
          data_kind: Database["public"]["Enums"]["data_kind"]
          fetched_at: string
          filed_at: string | null
          fiscal_quarter: number | null
          fiscal_year: number | null
          id: number
          ingested_job_id: string | null
          line_items: Json
          period: Database["public"]["Enums"]["statement_period"]
          period_end: string
          revised_at: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref: string | null
          statement_type: Database["public"]["Enums"]["statement_type"]
        }
        Insert: {
          company_id: string
          currency?: string | null
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          filed_at?: string | null
          fiscal_quarter?: number | null
          fiscal_year?: number | null
          id?: never
          ingested_job_id?: string | null
          line_items: Json
          period: Database["public"]["Enums"]["statement_period"]
          period_end: string
          revised_at?: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          statement_type: Database["public"]["Enums"]["statement_type"]
        }
        Update: {
          company_id?: string
          currency?: string | null
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          filed_at?: string | null
          fiscal_quarter?: number | null
          fiscal_year?: number | null
          id?: never
          ingested_job_id?: string | null
          line_items?: Json
          period?: Database["public"]["Enums"]["statement_period"]
          period_end?: string
          revised_at?: string | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          statement_type?: Database["public"]["Enums"]["statement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          accepted_count: number
          account_id: string | null
          created_at: string
          errors: Json
          filename: string | null
          id: string
          kind: string
          rejected_count: number
          row_count: number
          user_id: string
        }
        Insert: {
          accepted_count?: number
          account_id?: string | null
          created_at?: string
          errors?: Json
          filename?: string | null
          id?: string
          kind: string
          rejected_count?: number
          row_count?: number
          user_id: string
        }
        Update: {
          accepted_count?: number
          account_id?: string | null
          created_at?: string
          errors?: Json
          filename?: string | null
          id?: string
          kind?: string
          rejected_count?: number
          row_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      insider_transactions: {
        Row: {
          acquired_disposed: string | null
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          dedupe_key: string
          fetched_at: string
          filing_date: string | null
          id: number
          ingested_job_id: string | null
          insider_name: string
          insider_title: string | null
          price: number | null
          shares: number | null
          shares_owned_after: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          transaction_code: string | null
          transaction_date: string
          url: string | null
          value: number | null
        }
        Insert: {
          acquired_disposed?: string | null
          company_id: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          dedupe_key: string
          fetched_at?: string
          filing_date?: string | null
          id?: never
          ingested_job_id?: string | null
          insider_name: string
          insider_title?: string | null
          price?: number | null
          shares?: number | null
          shares_owned_after?: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          transaction_code?: string | null
          transaction_date: string
          url?: string | null
          value?: number | null
        }
        Update: {
          acquired_disposed?: string | null
          company_id?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          dedupe_key?: string
          fetched_at?: string
          filing_date?: string | null
          id?: never
          ingested_job_id?: string | null
          insider_name?: string
          insider_title?: string | null
          price?: number | null
          shares?: number | null
          shares_owned_after?: number | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          transaction_code?: string | null
          transaction_date?: string
          url?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insider_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_ownership: {
        Row: {
          closed_positions: number | null
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          fetched_at: string
          id: number
          ingested_job_id: string | null
          institutions_count: number | null
          new_positions: number | null
          ownership_pct: number | null
          report_date: string
          shares_change: number | null
          shares_held: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
        }
        Insert: {
          closed_positions?: number | null
          company_id: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          institutions_count?: number | null
          new_positions?: number | null
          ownership_pct?: number | null
          report_date: string
          shares_change?: number | null
          shares_held?: number | null
          source_provider: Database["public"]["Enums"]["provider_id"]
        }
        Update: {
          closed_positions?: number | null
          company_id?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          institutions_count?: number | null
          new_positions?: number | null
          ownership_pct?: number | null
          report_date?: string
          shares_change?: number | null
          shares_held?: number | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
        }
        Relationships: [
          {
            foreignKeyName: "institutional_ownership_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_profile_history: {
        Row: {
          created_at: string
          id: number
          profile_id: string
          snapshot: Json
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: never
          profile_id: string
          snapshot: Json
          user_id: string
          version: number
        }
        Update: {
          created_at?: string
          id?: never
          profile_id?: string
          snapshot?: Json
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_profile_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_profile_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_profiles: {
        Row: {
          cash_target_weight: number | null
          created_at: string
          derived_rules: Json
          derived_rules_confirmed_at: string | null
          dividend_preference: number | null
          excluded_sectors: string[]
          freeform_instructions: string | null
          growth_value_tilt: number | null
          horizon_years: number | null
          id: string
          market_cap_max: number | null
          market_cap_min: number | null
          max_drawdown: number | null
          max_net_debt_to_ebitda: number | null
          max_position_weight: number | null
          max_sector_weight: number | null
          max_speculative_weight: number | null
          min_eps_growth: number | null
          min_fcf_growth: number | null
          min_revenue_growth: number | null
          min_roic: number | null
          momentum_preference: number | null
          preferred_position_weight: number | null
          preferred_sectors: string[]
          quality_requirements: Json
          require_profitability: boolean
          risk_tolerance: number | null
          target_return: number | null
          updated_at: string
          user_id: string
          valuation_ranges: Json
          version: number
        }
        Insert: {
          cash_target_weight?: number | null
          created_at?: string
          derived_rules?: Json
          derived_rules_confirmed_at?: string | null
          dividend_preference?: number | null
          excluded_sectors?: string[]
          freeform_instructions?: string | null
          growth_value_tilt?: number | null
          horizon_years?: number | null
          id?: string
          market_cap_max?: number | null
          market_cap_min?: number | null
          max_drawdown?: number | null
          max_net_debt_to_ebitda?: number | null
          max_position_weight?: number | null
          max_sector_weight?: number | null
          max_speculative_weight?: number | null
          min_eps_growth?: number | null
          min_fcf_growth?: number | null
          min_revenue_growth?: number | null
          min_roic?: number | null
          momentum_preference?: number | null
          preferred_position_weight?: number | null
          preferred_sectors?: string[]
          quality_requirements?: Json
          require_profitability?: boolean
          risk_tolerance?: number | null
          target_return?: number | null
          updated_at?: string
          user_id: string
          valuation_ranges?: Json
          version?: number
        }
        Update: {
          cash_target_weight?: number | null
          created_at?: string
          derived_rules?: Json
          derived_rules_confirmed_at?: string | null
          dividend_preference?: number | null
          excluded_sectors?: string[]
          freeform_instructions?: string | null
          growth_value_tilt?: number | null
          horizon_years?: number | null
          id?: string
          market_cap_max?: number | null
          market_cap_min?: number | null
          max_drawdown?: number | null
          max_net_debt_to_ebitda?: number | null
          max_position_weight?: number | null
          max_sector_weight?: number | null
          max_speculative_weight?: number | null
          min_eps_growth?: number | null
          min_fcf_growth?: number | null
          min_revenue_growth?: number | null
          min_roic?: number | null
          momentum_preference?: number | null
          preferred_position_weight?: number | null
          preferred_sectors?: string[]
          quality_requirements?: Json
          require_profitability?: boolean
          risk_tolerance?: number | null
          target_return?: number | null
          updated_at?: string
          user_id?: string
          valuation_ranges?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_score_components: {
        Row: {
          as_of: string | null
          category: string
          contribution: number | null
          data_kind: Database["public"]["Enums"]["data_kind"] | null
          direction: number
          id: number
          is_missing: boolean
          is_stale: boolean
          metric_key: string
          own_history_z: number | null
          peer_count: number | null
          peer_group: string | null
          percentile_industry: number | null
          percentile_market: number | null
          percentile_sector: number | null
          raw_value: number | null
          score_id: string
          source_provider: Database["public"]["Enums"]["provider_id"] | null
          sub_score: number | null
          unit: string | null
          weight: number
        }
        Insert: {
          as_of?: string | null
          category: string
          contribution?: number | null
          data_kind?: Database["public"]["Enums"]["data_kind"] | null
          direction: number
          id?: never
          is_missing?: boolean
          is_stale?: boolean
          metric_key: string
          own_history_z?: number | null
          peer_count?: number | null
          peer_group?: string | null
          percentile_industry?: number | null
          percentile_market?: number | null
          percentile_sector?: number | null
          raw_value?: number | null
          score_id: string
          source_provider?: Database["public"]["Enums"]["provider_id"] | null
          sub_score?: number | null
          unit?: string | null
          weight: number
        }
        Update: {
          as_of?: string | null
          category?: string
          contribution?: number | null
          data_kind?: Database["public"]["Enums"]["data_kind"] | null
          direction?: number
          id?: never
          is_missing?: boolean
          is_stale?: boolean
          metric_key?: string
          own_history_z?: number | null
          peer_count?: number | null
          peer_group?: string | null
          percentile_industry?: number | null
          percentile_market?: number | null
          percentile_sector?: number | null
          raw_value?: number | null
          score_id?: string
          source_provider?: Database["public"]["Enums"]["provider_id"] | null
          sub_score?: number | null
          unit?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_score_components_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "investment_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_scores: {
        Row: {
          balance_sheet: number | null
          company_id: string
          competitive: number | null
          computed_at: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          coverage: number
          dna_failures: Json
          dna_pass: boolean | null
          forward: number | null
          growth: number | null
          id: string
          model_version: string
          momentum: number | null
          overall: number | null
          ownership: number | null
          personal: number | null
          quality: number | null
          revisions: number | null
          scoring_model_id: string | null
          snapshot_date: string
          user_id: string
          valuation: number | null
        }
        Insert: {
          balance_sheet?: number | null
          company_id: string
          competitive?: number | null
          computed_at?: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          coverage: number
          dna_failures?: Json
          dna_pass?: boolean | null
          forward?: number | null
          growth?: number | null
          id?: string
          model_version: string
          momentum?: number | null
          overall?: number | null
          ownership?: number | null
          personal?: number | null
          quality?: number | null
          revisions?: number | null
          scoring_model_id?: string | null
          snapshot_date: string
          user_id: string
          valuation?: number | null
        }
        Update: {
          balance_sheet?: number | null
          company_id?: string
          competitive?: number | null
          computed_at?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          coverage?: number
          dna_failures?: Json
          dna_pass?: boolean | null
          forward?: number | null
          growth?: number | null
          id?: string
          model_version?: string
          momentum?: number | null
          overall?: number | null
          ownership?: number | null
          personal?: number | null
          quality?: number | null
          revisions?: number | null
          scoring_model_id?: string | null
          snapshot_date?: string
          user_id?: string
          valuation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_scores_scoring_model_id_fkey"
            columns: ["scoring_model_id"]
            isOneToOne: false
            referencedRelation: "scoring_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          error: string | null
          failures: Json
          finished_at: string | null
          id: string
          items_failed: number
          items_total: number | null
          job_name: string
          provider_stats: Json
          records_updated: number
          started_at: string
          state: Json
          status: Database["public"]["Enums"]["job_status"]
          trigger: string
          triggered_by: string | null
        }
        Insert: {
          error?: string | null
          failures?: Json
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_total?: number | null
          job_name: string
          provider_stats?: Json
          records_updated?: number
          started_at?: string
          state?: Json
          status?: Database["public"]["Enums"]["job_status"]
          trigger?: string
          triggered_by?: string | null
        }
        Update: {
          error?: string | null
          failures?: Json
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_total?: number | null
          job_name?: string
          provider_stats?: Json
          records_updated?: number
          started_at?: string
          state?: Json
          status?: Database["public"]["Enums"]["job_status"]
          trigger?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          company_id: string | null
          confidence: number | null
          created_at: string
          decided_on: string
          decision: Database["public"]["Enums"]["journal_decision"]
          expected_catalysts: string | null
          id: string
          linked_transaction_id: string | null
          outcome_notes: string | null
          price_at_decision: number | null
          price_source: Database["public"]["Enums"]["provider_id"] | null
          review_on: string | null
          risks: string | null
          symbol: string
          thesis: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          decided_on: string
          decision: Database["public"]["Enums"]["journal_decision"]
          expected_catalysts?: string | null
          id?: string
          linked_transaction_id?: string | null
          outcome_notes?: string | null
          price_at_decision?: number | null
          price_source?: Database["public"]["Enums"]["provider_id"] | null
          review_on?: string | null
          risks?: string | null
          symbol: string
          thesis?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          decided_on?: string
          decision?: Database["public"]["Enums"]["journal_decision"]
          expected_catalysts?: string | null
          id?: string
          linked_transaction_id?: string | null
          outcome_notes?: string | null
          price_at_decision?: number | null
          price_source?: Database["public"]["Enums"]["provider_id"] | null
          review_on?: string | null
          risks?: string | null
          symbol?: string
          thesis?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "portfolio_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      news_article_symbols: {
        Row: {
          article_id: string
          company_id: string
        }
        Insert: {
          article_id: string
          company_id: string
        }
        Update: {
          article_id?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_article_symbols_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_article_symbols_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          fetched_at: string
          id: string
          image_url: string | null
          ingested_job_id: string | null
          published_at: string
          publisher: string | null
          sentiment: number | null
          sentiment_source: Database["public"]["Enums"]["provider_id"] | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          summary: string | null
          title: string
          url: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          image_url?: string | null
          ingested_job_id?: string | null
          published_at: string
          publisher?: string | null
          sentiment?: number | null
          sentiment_source?: Database["public"]["Enums"]["provider_id"] | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          summary?: string | null
          title: string
          url: string
        }
        Update: {
          fetched_at?: string
          id?: string
          image_url?: string | null
          ingested_job_id?: string | null
          published_at?: string
          publisher?: string | null
          sentiment?: number | null
          sentiment_source?: Database["public"]["Enums"]["provider_id"] | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          summary?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      portfolio_daily_snapshots: {
        Row: {
          account_id: string | null
          calc_version: string
          cash_value: number
          computed_at: string
          cost_basis: number | null
          daily_return: number | null
          dividends: number
          fees: number
          market_value: number
          net_external_flow: number
          positions: Json
          price_staleness: Json
          snapshot_date: string
          total_value: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          calc_version: string
          cash_value: number
          computed_at?: string
          cost_basis?: number | null
          daily_return?: number | null
          dividends?: number
          fees?: number
          market_value: number
          net_external_flow?: number
          positions: Json
          price_staleness?: Json
          snapshot_date: string
          total_value: number
          user_id: string
        }
        Update: {
          account_id?: string | null
          calc_version?: string
          cash_value?: number
          computed_at?: string
          cost_basis?: number | null
          daily_return?: number | null
          dividends?: number
          fees?: number
          market_value?: number
          net_external_flow?: number
          positions?: Json
          price_staleness?: Json
          snapshot_date?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_daily_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_daily_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_holdings: {
        Row: {
          account_id: string
          acquired_on: string | null
          as_of: string
          company_id: string | null
          cost_basis_total: number | null
          created_at: string
          currency: string
          id: string
          import_batch_id: string | null
          notes: string | null
          quantity: number
          source: Database["public"]["Enums"]["account_source"]
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          acquired_on?: string | null
          as_of?: string
          company_id?: string | null
          cost_basis_total?: number | null
          created_at?: string
          currency?: string
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          quantity: number
          source?: Database["public"]["Enums"]["account_source"]
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          acquired_on?: string | null
          as_of?: string
          company_id?: string | null
          cost_basis_total?: number | null
          created_at?: string
          currency?: string
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          quantity?: number
          source?: Database["public"]["Enums"]["account_source"]
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_holdings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_holdings_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_metrics: {
        Row: {
          benchmark: string | null
          calc_version: string
          computed_at: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          inputs: Json | null
          metric_key: string
          snapshot_date: string
          unit: string
          user_id: string
          value: number | null
          window_label: string
        }
        Insert: {
          benchmark?: string | null
          calc_version: string
          computed_at?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          inputs?: Json | null
          metric_key: string
          snapshot_date: string
          unit?: string
          user_id: string
          value?: number | null
          window_label?: string
        }
        Update: {
          benchmark?: string | null
          calc_version?: string
          computed_at?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          inputs?: Json | null
          metric_key?: string
          snapshot_date?: string
          unit?: string
          user_id?: string
          value?: number | null
          window_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_shares: {
        Row: {
          created_at: string
          id: string
          include_transactions: boolean
          owner_id: string
          revoked_at: string | null
          viewer_email: string
        }
        Insert: {
          created_at?: string
          id?: string
          include_transactions?: boolean
          owner_id: string
          revoked_at?: string | null
          viewer_email: string
        }
        Update: {
          created_at?: string
          id?: string
          include_transactions?: boolean
          owner_id?: string
          revoked_at?: string | null
          viewer_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_transactions: {
        Row: {
          account_id: string
          amount: number
          company_id: string | null
          created_at: string
          currency: string
          description: string | null
          external_id: string | null
          fees: number
          id: string
          import_batch_id: string | null
          price: number | null
          quantity: number | null
          settle_date: string | null
          source: Database["public"]["Enums"]["account_source"]
          split_ratio: number | null
          symbol: string | null
          trade_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          company_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          fees?: number
          id?: string
          import_batch_id?: string | null
          price?: number | null
          quantity?: number | null
          settle_date?: string | null
          source?: Database["public"]["Enums"]["account_source"]
          split_ratio?: number | null
          symbol?: string | null
          trade_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          company_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          fees?: number
          id?: string
          import_batch_id?: string | null
          price?: number | null
          quantity?: number | null
          settle_date?: string | null
          source?: Database["public"]["Enums"]["account_source"]
          split_ratio?: number | null
          symbol?: string | null
          trade_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      price_targets: {
        Row: {
          company_id: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          fetched_at: string
          id: number
          ingested_job_id: string | null
          num_analysts: number | null
          snapshot_date: string
          source_provider: Database["public"]["Enums"]["provider_id"]
          target_high: number | null
          target_low: number | null
          target_mean: number | null
          target_median: number | null
        }
        Insert: {
          company_id: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          num_analysts?: number | null
          snapshot_date: string
          source_provider: Database["public"]["Enums"]["provider_id"]
          target_high?: number | null
          target_low?: number | null
          target_mean?: number | null
          target_median?: number | null
        }
        Update: {
          company_id?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          fetched_at?: string
          id?: never
          ingested_job_id?: string | null
          num_analysts?: number | null
          snapshot_date?: string
          source_provider?: Database["public"]["Enums"]["provider_id"]
          target_high?: number | null
          target_low?: number | null
          target_mean?: number | null
          target_median?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_requests: {
        Row: {
          category: string
          duration_ms: number | null
          endpoint: string
          error_class: string | null
          error_message: string | null
          http_status: number | null
          id: number
          job_run_id: string | null
          ok: boolean
          provider: Database["public"]["Enums"]["provider_id"]
          requested_at: string
          schema_warnings: string[] | null
          symbol: string | null
        }
        Insert: {
          category: string
          duration_ms?: number | null
          endpoint: string
          error_class?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: never
          job_run_id?: string | null
          ok: boolean
          provider: Database["public"]["Enums"]["provider_id"]
          requested_at?: string
          schema_warnings?: string[] | null
          symbol?: string | null
        }
        Update: {
          category?: string
          duration_ms?: number | null
          endpoint?: string
          error_class?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: never
          job_run_id?: string | null
          ok?: boolean
          provider?: Database["public"]["Enums"]["provider_id"]
          requested_at?: string
          schema_warnings?: string[] | null
          symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_requests_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      recommendation_history: {
        Row: {
          changed_on: string
          company_id: string
          created_at: string
          from_rating:
            | Database["public"]["Enums"]["recommendation_rating"]
            | null
          from_recommendation_id: string | null
          id: number
          reasons: Json
          to_rating: Database["public"]["Enums"]["recommendation_rating"]
          to_recommendation_id: string | null
          user_id: string
        }
        Insert: {
          changed_on: string
          company_id: string
          created_at?: string
          from_rating?:
            | Database["public"]["Enums"]["recommendation_rating"]
            | null
          from_recommendation_id?: string | null
          id?: never
          reasons?: Json
          to_rating: Database["public"]["Enums"]["recommendation_rating"]
          to_recommendation_id?: string | null
          user_id: string
        }
        Update: {
          changed_on?: string
          company_id?: string
          created_at?: string
          from_rating?:
            | Database["public"]["Enums"]["recommendation_rating"]
            | null
          from_recommendation_id?: string | null
          id?: never
          reasons?: Json
          to_rating?: Database["public"]["Enums"]["recommendation_rating"]
          to_recommendation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_history_from_recommendation_id_fkey"
            columns: ["from_recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_history_to_recommendation_id_fkey"
            columns: ["to_recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          catalysts: Json
          company_id: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          data_freshness: Json
          downgrade_triggers: Json
          engine_version: string
          fair_value_high: number | null
          fair_value_low: number | null
          fair_value_methods: Json
          id: string
          narrative: Json | null
          narrative_fact_hash: string | null
          narrative_model: string | null
          negatives: Json
          portfolio_impact: Json
          positives: Json
          price: number | null
          price_as_of: string | null
          rating: Database["public"]["Enums"]["recommendation_rating"]
          risks: Json
          rules_fired: Json
          score_id: string | null
          snapshot_date: string
          upgrade_triggers: Json
          user_id: string
        }
        Insert: {
          catalysts?: Json
          company_id: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          data_freshness?: Json
          downgrade_triggers?: Json
          engine_version: string
          fair_value_high?: number | null
          fair_value_low?: number | null
          fair_value_methods?: Json
          id?: string
          narrative?: Json | null
          narrative_fact_hash?: string | null
          narrative_model?: string | null
          negatives?: Json
          portfolio_impact?: Json
          positives?: Json
          price?: number | null
          price_as_of?: string | null
          rating: Database["public"]["Enums"]["recommendation_rating"]
          risks?: Json
          rules_fired?: Json
          score_id?: string | null
          snapshot_date: string
          upgrade_triggers?: Json
          user_id: string
        }
        Update: {
          catalysts?: Json
          company_id?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          data_freshness?: Json
          downgrade_triggers?: Json
          engine_version?: string
          fair_value_high?: number | null
          fair_value_low?: number | null
          fair_value_methods?: Json
          id?: string
          narrative?: Json | null
          narrative_fact_hash?: string | null
          narrative_model?: string | null
          negatives?: Json
          portfolio_impact?: Json
          positives?: Json
          price?: number | null
          price_as_of?: string | null
          rating?: Database["public"]["Enums"]["recommendation_rating"]
          risks?: Json
          rules_fired?: Json
          score_id?: string | null
          snapshot_date?: string
          upgrade_triggers?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "investment_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_results: {
        Row: {
          created_at: string
          id: number
          payload: Json
          result_key: string
          run_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          payload: Json
          result_key: string
          run_id: string
        }
        Update: {
          created_at?: string
          id?: never
          payload?: Json
          result_key?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_runs: {
        Row: {
          assumptions: Json
          created_at: string
          data_as_of: Json
          engine_version: string
          id: string
          kind: string
          name: string | null
          prompt: string | null
          seed: number | null
          user_id: string
        }
        Insert: {
          assumptions: Json
          created_at?: string
          data_as_of?: Json
          engine_version: string
          id?: string
          kind: string
          name?: string | null
          prompt?: string | null
          seed?: number | null
          user_id: string
        }
        Update: {
          assumptions?: Json
          created_at?: string
          data_as_of?: Json
          engine_version?: string
          id?: string
          kind?: string
          name?: string | null
          prompt?: string | null
          seed?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_models: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          metric_weights: Json
          name: string
          peer_blend: Json
          updated_at: string
          user_id: string
          weights: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          metric_weights?: Json
          name?: string
          peer_blend?: Json
          updated_at?: string
          user_id: string
          weights: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          metric_weights?: Json
          name?: string
          peer_blend?: Json
          updated_at?: string
          user_id?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scoring_models_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      screener_results: {
        Row: {
          company_id: string
          match_score: number | null
          metric_values: Json
          rank: number | null
          run_id: string
          why_matches: Json
        }
        Insert: {
          company_id: string
          match_score?: number | null
          metric_values: Json
          rank?: number | null
          run_id: string
          why_matches?: Json
        }
        Update: {
          company_id?: string
          match_score?: number | null
          metric_values?: Json
          rank?: number | null
          run_id?: string
          why_matches?: Json
        }
        Relationships: [
          {
            foreignKeyName: "screener_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screener_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "screener_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      screener_rules: {
        Row: {
          group_id: number
          group_logic: string
          id: string
          is_required: boolean
          metric_key: string
          operator: string
          screener_id: string
          sort_order: number
          value: Json
          weight: number
        }
        Insert: {
          group_id?: number
          group_logic?: string
          id?: string
          is_required?: boolean
          metric_key: string
          operator: string
          screener_id: string
          sort_order?: number
          value: Json
          weight?: number
        }
        Update: {
          group_id?: number
          group_logic?: string
          id?: string
          is_required?: boolean
          metric_key?: string
          operator?: string
          screener_id?: string
          sort_order?: number
          value?: Json
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "screener_rules_screener_id_fkey"
            columns: ["screener_id"]
            isOneToOne: false
            referencedRelation: "screeners"
            referencedColumns: ["id"]
          },
        ]
      }
      screener_runs: {
        Row: {
          created_at: string
          data_as_of: Json
          id: string
          match_count: number | null
          rules_snapshot: Json
          run_date: string
          screener_id: string
          universe_size: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_as_of?: Json
          id?: string
          match_count?: number | null
          rules_snapshot: Json
          run_date: string
          screener_id: string
          universe_size?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          data_as_of?: Json
          id?: string
          match_count?: number | null
          rules_snapshot?: Json
          run_date?: string
          screener_id?: string
          universe_size?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screener_runs_screener_id_fkey"
            columns: ["screener_id"]
            isOneToOne: false
            referencedRelation: "screeners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screener_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      screeners: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          natural_language_query: string | null
          root_logic: string
          run_daily: boolean
          universe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          natural_language_query?: string | null
          root_logic?: string
          run_daily?: boolean
          universe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          natural_language_query?: string | null
          root_logic?: string
          run_daily?: boolean
          universe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screeners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      security_prices: {
        Row: {
          adj_close: number | null
          close: number
          company_id: string
          currency: string | null
          fetched_at: string
          high: number | null
          ingested_job_id: string | null
          low: number | null
          open: number | null
          price_date: string
          revised_at: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref: string | null
          volume: number | null
          vwap: number | null
        }
        Insert: {
          adj_close?: number | null
          close: number
          company_id: string
          currency?: string | null
          fetched_at?: string
          high?: number | null
          ingested_job_id?: string | null
          low?: number | null
          open?: number | null
          price_date: string
          revised_at?: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          volume?: number | null
          vwap?: number | null
        }
        Update: {
          adj_close?: number | null
          close?: number
          company_id?: string
          currency?: string | null
          fetched_at?: string
          high?: number | null
          ingested_job_id?: string | null
          low?: number | null
          open?: number | null
          price_date?: string
          revised_at?: string | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          volume?: number | null
          vwap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "security_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      security_quotes: {
        Row: {
          change: number | null
          change_pct: number | null
          company_id: string
          currency: string | null
          day_high: number | null
          day_low: number | null
          fetched_at: string
          ingested_job_id: string | null
          market_cap: number | null
          open: number | null
          previous_close: number | null
          price: number | null
          quote_time: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref: string | null
          volume: number | null
          year_high: number | null
          year_low: number | null
        }
        Insert: {
          change?: number | null
          change_pct?: number | null
          company_id: string
          currency?: string | null
          day_high?: number | null
          day_low?: number | null
          fetched_at?: string
          ingested_job_id?: string | null
          market_cap?: number | null
          open?: number | null
          previous_close?: number | null
          price?: number | null
          quote_time?: string | null
          source_provider: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          volume?: number | null
          year_high?: number | null
          year_low?: number | null
        }
        Update: {
          change?: number | null
          change_pct?: number | null
          company_id?: string
          currency?: string | null
          day_high?: number | null
          day_low?: number | null
          fetched_at?: string
          ingested_job_id?: string | null
          market_cap?: number | null
          open?: number | null
          previous_close?: number | null
          price?: number | null
          quote_time?: string | null
          source_provider?: Database["public"]["Enums"]["provider_id"]
          source_ref?: string | null
          volume?: number | null
          year_high?: number | null
          year_low?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "security_quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          base_currency: string
          created_at: string
          display_name: string | null
          email: string
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      valuation_snapshots: {
        Row: {
          calc_version: string
          company_id: string
          computed_at: string
          data_kind: Database["public"]["Enums"]["data_kind"]
          dividend_yield: number | null
          earnings_yield: number | null
          enterprise_value: number | null
          ev_ebitda: number | null
          ev_sales: number | null
          fcf_yield: number | null
          ingested_job_id: string | null
          inputs: Json
          market_cap: number | null
          p_fcf: number | null
          pe_forward: number | null
          pe_ttm: number | null
          peg: number | null
          price: number | null
          ps_ttm: number | null
          snapshot_date: string
        }
        Insert: {
          calc_version: string
          company_id: string
          computed_at?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          dividend_yield?: number | null
          earnings_yield?: number | null
          enterprise_value?: number | null
          ev_ebitda?: number | null
          ev_sales?: number | null
          fcf_yield?: number | null
          ingested_job_id?: string | null
          inputs?: Json
          market_cap?: number | null
          p_fcf?: number | null
          pe_forward?: number | null
          pe_ttm?: number | null
          peg?: number | null
          price?: number | null
          ps_ttm?: number | null
          snapshot_date: string
        }
        Update: {
          calc_version?: string
          company_id?: string
          computed_at?: string
          data_kind?: Database["public"]["Enums"]["data_kind"]
          dividend_yield?: number | null
          earnings_yield?: number | null
          enterprise_value?: number | null
          ev_ebitda?: number | null
          ev_sales?: number | null
          fcf_yield?: number | null
          ingested_job_id?: string | null
          inputs?: Json
          market_cap?: number | null
          p_fcf?: number | null
          pe_forward?: number | null
          pe_ttm?: number | null
          peg?: number | null
          price?: number | null
          ps_ttm?: number | null
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_members: {
        Row: {
          added_at: string
          added_price: number | null
          added_score: number | null
          company_id: string
          notes: string | null
          removed_at: string | null
          target_price: number | null
          user_id: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          added_price?: number | null
          added_score?: number | null
          company_id: string
          notes?: string | null
          removed_at?: string | null
          target_price?: number | null
          user_id: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          added_price?: number | null
          added_score?: number | null
          company_id?: string
          notes?: string | null
          removed_at?: string | null
          target_price?: number | null
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_members_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      data_freshness: {
        Row: {
          category: string | null
          critical_age_hours: number | null
          dataset: string | null
          label: string | null
          last_fetched_at: string | null
          latest_as_of: string | null
          max_age_hours: number | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _p3: { Args: never; Returns: number }
      _p4: { Args: never; Returns: number }
      _p5: { Args: never; Returns: number }
      _probe: { Args: never; Returns: string }
      can_view_portfolio: {
        Args: { p_need_transactions?: boolean; p_owner: string }
        Returns: boolean
      }
      current_access_role: {
        Args: never
        Returns: Database["public"]["Enums"]["access_role"]
      }
      current_email: { Args: never; Returns: string }
      has_access: { Args: never; Returns: boolean }
      hook_before_user_created: { Args: { event: Json }; Returns: Json }
      is_invited: { Args: { p_email: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      access_role: "owner" | "member"
      account_source: "manual" | "csv" | "plaid"
      account_type:
        | "taxable"
        | "ira_traditional"
        | "ira_roth"
        | "401k"
        | "hsa"
        | "other"
      asset_class:
        | "equity"
        | "fixed_income"
        | "cash"
        | "commodity"
        | "real_estate"
        | "crypto"
        | "multi_asset"
        | "other"
      confidence_level: "high" | "medium" | "low"
      data_kind:
        | "reported"
        | "provider_derived"
        | "calculated"
        | "estimate"
        | "ai_interpretation"
        | "scenario_assumption"
      job_status: "running" | "success" | "partial" | "failed" | "skipped"
      journal_decision: "buy" | "sell" | "watch" | "pass" | "add" | "trim"
      provider_id:
        | "fmp"
        | "sec_edgar"
        | "polygon"
        | "plaid"
        | "manual"
        | "csv"
        | "calc"
        | "mock"
      recommendation_rating:
        | "strong_buy"
        | "buy"
        | "watch"
        | "hold"
        | "reduce"
        | "avoid"
      security_type:
        | "stock"
        | "etf"
        | "fund"
        | "adr"
        | "index"
        | "cash"
        | "crypto"
        | "other"
      statement_period: "annual" | "quarter" | "ttm"
      statement_type: "income" | "balance" | "cash_flow"
      tracking_mode: "positions" | "transactions"
      transaction_type:
        | "buy"
        | "sell"
        | "dividend"
        | "interest"
        | "deposit"
        | "withdrawal"
        | "fee"
        | "split"
        | "transfer_in"
        | "transfer_out"
        | "reinvest"
        | "other"
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
      access_role: ["owner", "member"],
      account_source: ["manual", "csv", "plaid"],
      account_type: [
        "taxable",
        "ira_traditional",
        "ira_roth",
        "401k",
        "hsa",
        "other",
      ],
      asset_class: [
        "equity",
        "fixed_income",
        "cash",
        "commodity",
        "real_estate",
        "crypto",
        "multi_asset",
        "other",
      ],
      confidence_level: ["high", "medium", "low"],
      data_kind: [
        "reported",
        "provider_derived",
        "calculated",
        "estimate",
        "ai_interpretation",
        "scenario_assumption",
      ],
      job_status: ["running", "success", "partial", "failed", "skipped"],
      journal_decision: ["buy", "sell", "watch", "pass", "add", "trim"],
      provider_id: [
        "fmp",
        "sec_edgar",
        "polygon",
        "plaid",
        "manual",
        "csv",
        "calc",
        "mock",
      ],
      recommendation_rating: [
        "strong_buy",
        "buy",
        "watch",
        "hold",
        "reduce",
        "avoid",
      ],
      security_type: [
        "stock",
        "etf",
        "fund",
        "adr",
        "index",
        "cash",
        "crypto",
        "other",
      ],
      statement_period: ["annual", "quarter", "ttm"],
      statement_type: ["income", "balance", "cash_flow"],
      tracking_mode: ["positions", "transactions"],
      transaction_type: [
        "buy",
        "sell",
        "dividend",
        "interest",
        "deposit",
        "withdrawal",
        "fee",
        "split",
        "transfer_in",
        "transfer_out",
        "reinvest",
        "other",
      ],
    },
  },
} as const
