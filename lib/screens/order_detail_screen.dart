import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class OrderDetailScreen extends StatelessWidget {
  final String orderId;
  final Map<String, dynamic> data;
  const OrderDetailScreen({super.key, required this.orderId, required this.data});

  Color _statusColor(String? status) {
    switch (status) {
      case 'Delivered': return Colors.green;
      case 'Processing': return Colors.orange;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ts = data['timestamp'] as Timestamp?;
    final dateStr = ts != null ? DateFormat('MMM d, yyyy – h:mm a').format(ts.toDate()) : '';
    final itemsDetailed = (data['itemsDetailed'] as List<dynamic>?) ?? [];
    final status = data['status'] ?? 'Pending';

    return Scaffold(
      backgroundColor: const Color(0xFFF7F5FC),
      appBar: AppBar(
        title: const Text('Order Details'),
        backgroundColor: const Color(0xFF8E7CF0),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Status', style: TextStyle(color: Colors.grey, fontSize: 12)),
                    Text(status, style: TextStyle(fontWeight: FontWeight.bold, color: _statusColor(status), fontSize: 16)),
                  ],
                ),
                Text(dateStr, style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('Items', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 10),
          ...itemsDetailed.map((item) {
            final imageUrl = (item['imageUrl'] ?? '').toString();
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 60, height: 60,
                      color: const Color(0xFFF7F5FC),
                      padding: const EdgeInsets.all(6),
                      child: imageUrl.isNotEmpty
                          ? Image.network(imageUrl, fit: BoxFit.contain,
                          errorBuilder: (c, e, s) => const Icon(Icons.inventory_2, color: Color(0xFF8E7CF0)))
                          : const Icon(Icons.inventory_2, color: Color(0xFF8E7CF0)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                        Text('₱${item['price']} x ${item['quantity']}', style: TextStyle(color: Colors.grey[600])),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total', style: TextStyle(fontWeight: FontWeight.bold)),
                Text('₱${data['total']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF8E7CF0))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}