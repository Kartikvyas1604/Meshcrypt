import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'swap' | 'bridge';
  amount: string;
  token: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  privacy: {
    stealthAddress: boolean;
    confidentialAmount: boolean;
    rangeProof: boolean;
    zkProof: boolean;
    mixingRounds?: number;
  };
  from?: string;
  to?: string;
  commitment?: string;
  nullifier?: string;
  txHash?: string;
}

interface PrivateTransactionHistoryProps {
  transactions: Transaction[];
  onTransactionPress?: (transaction: Transaction) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export const PrivateTransactionHistory: React.FC<PrivateTransactionHistoryProps> = ({
  transactions,
  onTransactionPress,
  onRefresh,
  loading = false,
}) => {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [filter, setFilter] = useState<'all' | 'private' | 'public'>('all');

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    const isPrivate = tx.privacy.stealthAddress || tx.privacy.confidentialAmount;
    return filter === 'private' ? isPrivate : !isPrivate;
  });

  const calculatePrivacyScore = (privacy: Transaction['privacy']): number => {
    let score = 0;
    if (privacy.stealthAddress) score += 25;
    if (privacy.confidentialAmount) score += 25;
    if (privacy.rangeProof) score += 20;
    if (privacy.zkProof) score += 20;
    if (privacy.mixingRounds && privacy.mixingRounds > 0) score += 10;
    return score;
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const privacyScore = calculatePrivacyScore(item.privacy);
    const isPrivate = privacyScore > 50;

    return (
      <TouchableOpacity
        style={styles.txCard}
        onPress={() => setSelectedTx(item)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={isPrivate ? ['#1e293b', '#312e81', '#1e293b'] : ['#1e293b', '#334155', '#1e293b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.txGradient}
        >
          {/* Transaction Icon & Type */}
          <View style={styles.txIcon}>
            <Ionicons
              name={
                item.type === 'send' ? 'arrow-up' :
                item.type === 'receive' ? 'arrow-down' :
                item.type === 'swap' ? 'swap-horizontal' :
                'git-branch'
              }
              size={24}
              color={
                item.type === 'send' ? '#ef4444' :
                item.type === 'receive' ? '#10b981' :
                item.type === 'swap' ? '#8b5cf6' :
                '#06b6d4'
              }
            />
          </View>

          {/* Transaction Info */}
          <View style={styles.txInfo}>
            <View style={styles.txHeader}>
              <Text style={styles.txType}>
                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
              </Text>
              {isPrivate && (
                <View style={styles.privateBadge}>
                  <Ionicons name="eye-off" size={12} color="#8b5cf6" />
                  <Text style={styles.privateBadgeText}>Private</Text>
                </View>
              )}
            </View>

            <Text style={styles.txAmount}>
              {item.type === 'send' ? '-' : '+'}{item.amount} {item.token}
            </Text>

            <View style={styles.txMeta}>
              <Text style={styles.txTime}>
                {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
              <View style={[
                styles.txStatus,
                item.status === 'confirmed' && styles.txStatusConfirmed,
                item.status === 'pending' && styles.txStatusPending,
                item.status === 'failed' && styles.txStatusFailed,
              ]}>
                <Text style={styles.txStatusText}>{item.status}</Text>
              </View>
            </View>

            {/* Privacy Indicators */}
            <View style={styles.privacyIndicators}>
              {item.privacy.stealthAddress && (
                <PrivacyBadge icon="eye-off" label="Stealth" />
              )}
              {item.privacy.confidentialAmount && (
                <PrivacyBadge icon="lock-closed" label="Confidential" />
              )}
              {item.privacy.rangeProof && (
                <PrivacyBadge icon="analytics" label="Range Proof" />
              )}
              {item.privacy.zkProof && (
                <PrivacyBadge icon="shield-checkmark" label="ZK Proof" />
              )}
            </View>
          </View>

          {/* Privacy Score */}
          <View style={styles.privacyScore}>
            <PrivacyScoreCircle score={privacyScore} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FilterTab
          label="All"
          active={filter === 'all'}
          onPress={() => setFilter('all')}
          count={transactions.length}
        />
        <FilterTab
          label="Private"
          active={filter === 'private'}
          onPress={() => setFilter('private')}
          count={transactions.filter(tx => 
            tx.privacy.stealthAddress || tx.privacy.confidentialAmount
          ).length}
        />
        <FilterTab
          label="Public"
          active={filter === 'public'}
          onPress={() => setFilter('public')}
          count={transactions.filter(tx => 
            !tx.privacy.stealthAddress && !tx.privacy.confidentialAmount
          ).length}
        />
      </View>

      {/* Transaction List */}
      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="documents-outline" size={64} color="#475569" />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>
              Your transaction history will appear here
            </Text>
          </View>
        }
      />

      {/* Transaction Detail Modal */}
      <Modal
        visible={!!selectedTx}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTx(null)}
      >
        {selectedTx && (
          <TransactionDetailModal
            transaction={selectedTx}
            onClose={() => setSelectedTx(null)}
          />
        )}
      </Modal>
    </View>
  );
};

interface FilterTabProps {
  label: string;
  active: boolean;
  onPress: () => void;
  count: number;
}

const FilterTab: React.FC<FilterTabProps> = ({ label, active, onPress, count }) => (
  <TouchableOpacity
    style={[styles.filterTab, active && styles.filterTabActive]}
    onPress={onPress}
  >
    <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
      {label}
    </Text>
    <View style={[styles.filterCount, active && styles.filterCountActive]}>
      <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
        {count}
      </Text>
    </View>
  </TouchableOpacity>
);

interface PrivacyBadgeProps {
  icon: string;
  label: string;
}

const PrivacyBadge: React.FC<PrivacyBadgeProps> = ({ icon, label }) => (
  <View style={styles.badge}>
    <Ionicons name={icon as any} size={12} color="#8b5cf6" />
    <Text style={styles.badgeText}>{label}</Text>
  </View>
);

interface PrivacyScoreCircleProps {
  score: number;
}

const PrivacyScoreCircle: React.FC<PrivacyScoreCircleProps> = ({ score }) => {
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#6b7280';
  
  return (
    <View style={[styles.scoreCircle, { borderColor: color }]}>
      <Text style={[styles.scoreText, { color }]}>{score}</Text>
    </View>
  );
};

interface TransactionDetailModalProps {
  transaction: Transaction;
  onClose: () => void;
}

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
}) => {
  const privacyScore = React.useMemo(() => {
    let score = 0;
    if (transaction.privacy.stealthAddress) score += 25;
    if (transaction.privacy.confidentialAmount) score += 25;
    if (transaction.privacy.rangeProof) score += 20;
    if (transaction.privacy.zkProof) score += 20;
    if (transaction.privacy.mixingRounds && transaction.privacy.mixingRounds > 0) score += 10;
    return score;
  }, [transaction]);

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalBackdrop} />
      <View style={styles.modalContent}>
        <LinearGradient
          colors={['#1e293b', '#334155']}
          style={styles.modalGradient}
        >
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Transaction Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Transaction Type & Amount */}
          <View style={styles.modalSection}>
            <View style={styles.modalAmountBox}>
              <Ionicons
                name={
                  transaction.type === 'send' ? 'arrow-up' :
                  transaction.type === 'receive' ? 'arrow-down' :
                  transaction.type === 'swap' ? 'swap-horizontal' :
                  'git-branch'
                }
                size={32}
                color={
                  transaction.type === 'send' ? '#ef4444' :
                  transaction.type === 'receive' ? '#10b981' :
                  transaction.type === 'swap' ? '#8b5cf6' :
                  '#06b6d4'
                }
              />
              <Text style={styles.modalAmount}>
                {transaction.type === 'send' ? '-' : '+'}{transaction.amount} {transaction.token}
              </Text>
            </View>
          </View>

          {/* Privacy Score */}
          <View style={styles.modalSection}>
            <Text style={styles.sectionLabel}>Privacy Score</Text>
            <View style={styles.scoreBar}>
              <View style={[styles.scoreBarFill, { width: `${privacyScore}%` }]} />
              <Text style={styles.scoreBarText}>{privacyScore}%</Text>
            </View>
          </View>

          {/* Privacy Features */}
          <View style={styles.modalSection}>
            <Text style={styles.sectionLabel}>Privacy Features</Text>
            <DetailItem
              icon="eye-off"
              label="Stealth Address"
              value={transaction.privacy.stealthAddress ? 'Enabled' : 'Disabled'}
              active={transaction.privacy.stealthAddress}
            />
            <DetailItem
              icon="lock-closed"
              label="Confidential Amount"
              value={transaction.privacy.confidentialAmount ? 'Enabled' : 'Disabled'}
              active={transaction.privacy.confidentialAmount}
            />
            <DetailItem
              icon="analytics"
              label="Range Proof"
              value={transaction.privacy.rangeProof ? 'Verified' : 'Not included'}
              active={transaction.privacy.rangeProof}
            />
            <DetailItem
              icon="shield-checkmark"
              label="ZK Proof"
              value={transaction.privacy.zkProof ? 'Verified' : 'Not included'}
              active={transaction.privacy.zkProof}
            />
          </View>

          {/* Technical Details */}
          <View style={styles.modalSection}>
            <Text style={styles.sectionLabel}>Technical Details</Text>
            {transaction.commitment && (
              <TechDetail label="Commitment" value={transaction.commitment} />
            )}
            {transaction.nullifier && (
              <TechDetail label="Nullifier" value={transaction.nullifier} />
            )}
            {transaction.txHash && (
              <TechDetail label="TX Hash" value={transaction.txHash} />
            )}
            <TechDetail
              label="Timestamp"
              value={new Date(transaction.timestamp).toLocaleString()}
            />
            <TechDetail label="Status" value={transaction.status} />
          </View>
        </LinearGradient>
      </View>
    </View>
  );
};

interface DetailItemProps {
  icon: string;
  label: string;
  value: string;
  active: boolean;
}

const DetailItem: React.FC<DetailItemProps> = ({ icon, label, value, active }) => (
  <View style={styles.detailItem}>
    <View style={styles.detailLeft}>
      <Ionicons name={icon as any} size={20} color={active ? '#8b5cf6' : '#6b7280'} />
      <Text style={[styles.detailLabel, !active && styles.detailLabelInactive]}>
        {label}
      </Text>
    </View>
    <Text style={[styles.detailValue, active && styles.detailValueActive]}>
      {value}
    </Text>
  </View>
);

interface TechDetailProps {
  label: string;
  value: string;
}

const TechDetail: React.FC<TechDetailProps> = ({ label, value }) => (
  <View style={styles.techDetail}>
    <Text style={styles.techLabel}>{label}</Text>
    <Text style={styles.techValue} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: '#8b5cf6',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginRight: 8,
  },
  filterLabelActive: {
    color: '#8b5cf6',
  },
  filterCount: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  filterCountActive: {
    backgroundColor: '#8b5cf6',
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#cbd5e1',
  },
  filterCountTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  txCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
  },
  txGradient: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  txIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  txType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginRight: 8,
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  privateBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8b5cf6',
    marginLeft: 4,
  },
  txAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  txTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  txStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#6b7280',
  },
  txStatusConfirmed: {
    backgroundColor: '#10b981',
  },
  txStatusPending: {
    backgroundColor: '#f59e0b',
  },
  txStatusFailed: {
    backgroundColor: '#ef4444',
  },
  txStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  privacyIndicators: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8b5cf6',
    marginLeft: 4,
  },
  privacyScore: {
    marginLeft: 12,
  },
  scoreCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#cbd5e1',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  closeButton: {
    padding: 4,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalAmountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  modalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  scoreBar: {
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scoreBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#8b5cf6',
  },
  scoreBarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    zIndex: 1,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#cbd5e1',
    marginLeft: 10,
  },
  detailLabelInactive: {
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  detailValueActive: {
    color: '#10b981',
  },
  techDetail: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  techLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  techValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#e5e7eb',
    lineHeight: 18,
  },
});
