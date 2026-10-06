import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import 'order_detail_screen.dart';

class OrderHistoryScreen extends StatelessWidget {
  const OrderHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: const Color(0xFFF7F5FC),
        appBar: AppBar(
          title: const Text('Order History'),
          backgroundColor: const Color(0xFF8E7CF0),
          foregroundColor: Colors.white,
          bottom: const TabBar(
            indicatorColor: Colors.white,
            tabs: [Tab(text: 'Pending'), Tab(text: 'Processing'), Tab(text: 'Delivered')],
          ),
        ),
        body: TabBarView(
          children: [
            _OrderList(userId: user?.uid, status: 'Pending'),
            _OrderList(userId: user?.uid, status: 'Processing'),
            _OrderList(userId: user?.uid, status: 'Delivered'),
          ],
        ),
      ),
    );
  }
}

class _OrderList extends StatelessWidget {
  final String? userId;
  final String status;
  const _OrderList({required this.userId, required this.status});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('orders')
          .where('userId', isEqualTo: userId)
          .where('status', isEqualTo: status)
          .orderBy('timestamp', descending: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final docs = snapshot.data!.docs;
        if (docs.isEmpty) return Center(child: Text('No $status orders.', style: TextStyle(color: Colors.grey[500])));
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: docs.length,
          itemBuilder: (context, index) {
            final doc = docs[index];
            final o = doc.data() as Map<String, dynamic>;
            final ts = o['timestamp'] as Timestamp?;
            final dateStr = ts != null ? DateFormat('MMM d, yyyy – h:mm a').format(ts.toDate()) : 'Just now';
            final itemsDetailed = (o['itemsDetailed'] as List<dynamic>?) ?? [];
            final firstImg = itemsDetailed.isNotEmpty ? (itemsDetailed[0]['imageUrl'] ?? '').toString() : '';

            return GestureDetector(
              onTap: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: doc.id, data: o))),
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)],
                ),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        width: 56, height: 56,
                        color: const Color(0xFFF7F5FC),
                        padding: const EdgeInsets.all(6),
                        child: firstImg.isNotEmpty
                            ? Image.network(firstImg, fit: BoxFit.contain,
                            errorBuilder: (c, e, s) => const Icon(Icons.inventory_2, color: Color(0xFF8E7CF0)))
                            : const Icon(Icons.inventory_2, color: Color(0xFF8E7CF0)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(o['items'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(height: 4),
                          Text(dateStr, style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                        ],
                      ),
                    ),
                    Text('₱${o['total']}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF8E7CF0))),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}