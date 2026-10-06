import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../cart_state.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  Future<void> _checkout(BuildContext context) async {
    final cart = context.read<CartState>();
    final user = FirebaseAuth.instance.currentUser;
    final selected = cart.selectedItems;
    if (selected.isEmpty || user == null) return;

    final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
    final customerName = userDoc.data()?['name'] ?? user.email;

    await FirebaseFirestore.instance.collection('orders').add({
      'userId': user.uid,
      'customerName': customerName,
      'items': selected.map((i) => '${i.name} x${i.quantity}').join(', '),
      'itemsDetailed': selected.map((i) => {
        'productId': i.productId,
        'name': i.name,
        'price': i.price,
        'quantity': i.quantity,
        'imageUrl': i.imageUrl,
      }).toList(),
      'total': selected.fold(0.0, (sum, i) => sum + i.subtotal),
      'status': 'Pending',
      'timestamp': FieldValue.serverTimestamp(),
    });

    cart.removeSelected();

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Order placed!')));
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();

    return Scaffold(
      backgroundColor: const Color(0xFFF7F5FC),
      appBar: AppBar(
        title: const Text('Your Cart'),
        backgroundColor: const Color(0xFF8E7CF0),
        foregroundColor: Colors.white,
      ),
      body: cart.items.isEmpty
          ? const Center(child: Text('Cart is empty'))
          : ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: cart.items.length,
        itemBuilder: (context, index) {
          final item = cart.items[index];
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)],
            ),
            child: Row(
              children: [
                Checkbox(
                  value: item.selected,
                  activeColor: const Color(0xFF8E7CF0),
                  onChanged: (_) => context.read<CartState>().toggleSelected(item.productId),
                ),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    width: 60,
                    height: 60,
                    color: const Color(0xFFF7F5FC),
                    padding: const EdgeInsets.all(6),
                    child: item.imageUrl.isNotEmpty
                        ? Image.network(
                      item.imageUrl,
                      fit: BoxFit.contain,
                      errorBuilder: (c, e, s) => const Icon(Icons.inventory_2, color: Color(0xFF8E7CF0)),
                    )
                        : const Icon(Icons.inventory_2, color: Color(0xFF8E7CF0)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 4),
                      Text('₱${item.price}', style: const TextStyle(color: Color(0xFF8E7CF0), fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                Column(
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        InkWell(
                          onTap: () => context.read<CartState>().decreaseQuantity(item.productId),
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(color: const Color(0xFFF7F5FC), borderRadius: BorderRadius.circular(6)),
                            child: const Icon(Icons.remove, size: 16),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Text('${item.quantity}'),
                        ),
                        InkWell(
                          onTap: () => context.read<CartState>().increaseQuantity(item.productId),
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(color: const Color(0xFFF7F5FC), borderRadius: BorderRadius.circular(6)),
                            child: const Icon(Icons.add, size: 16),
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 20),
                      onPressed: () => context.read<CartState>().removeItem(item.productId),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, -2))],
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total', style: TextStyle(fontSize: 14, color: Colors.grey)),
                  Text('₱${cart.totalAmount.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF8E7CF0))),
                ],
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8E7CF0),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: cart.selectedItems.isEmpty ? null : () => _checkout(context),
                  child: const Text('Checkout', style: TextStyle(color: Colors.white, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}