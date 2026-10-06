import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../cart_state.dart';

class ProductDetailsScreen extends StatelessWidget {
  final String productId;
  final Map<String, dynamic> data;

  const ProductDetailsScreen({super.key, required this.productId, required this.data});

  @override
  Widget build(BuildContext context) {
    final imageUrl = (data['imageUrl'] ?? '').toString();
    return Scaffold(
      backgroundColor: const Color(0xFFF7F5FC),
      appBar: AppBar(
        title: Text(data['productName'] ?? 'Product'),
        backgroundColor: const Color(0xFF8E7CF0),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 10)],
              ),
              padding: const EdgeInsets.all(12),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: imageUrl.isNotEmpty
                    ? Image.network(
                  imageUrl,
                  fit: BoxFit.contain,
                  errorBuilder: (c, e, s) => const Icon(Icons.inventory_2, size: 80, color: Color(0xFF8E7CF0)),
                )
                    : const Icon(Icons.inventory_2, size: 80, color: Color(0xFF8E7CF0)),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(data['productName'] ?? '', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('₱${data['price']}', style: const TextStyle(fontSize: 20, color: Color(0xFF8E7CF0), fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Stock: ${data['stock'] ?? 0}', style: TextStyle(color: Colors.grey[600])),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: Text(data['description'] ?? '', style: const TextStyle(fontSize: 14)),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF8E7CF0),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.add_shopping_cart, color: Colors.white),
              label: const Text('Add to Cart', style: TextStyle(color: Colors.white, fontSize: 16)),
              onPressed: () {
                context.read<CartState>().addItem(
                  productId,
                  data['productName'] ?? '',
                  (data['price'] as num).toDouble(),
                  imageUrl,
                );
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Added to cart')));
              },
            ),
          ),
        ],
      ),
    );
  }
}