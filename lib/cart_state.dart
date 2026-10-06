import 'package:flutter/foundation.dart';

class CartItem {
  final String productId;
  final String name;
  final double price;
  final String imageUrl;
  int quantity;
  bool selected;

  CartItem({
    required this.productId,
    required this.name,
    required this.price,
    required this.imageUrl,
    this.quantity = 1,
    this.selected = true,
  });

  double get subtotal => price * quantity;
}

class CartState extends ChangeNotifier {
  final List<CartItem> _items = [];

  List<CartItem> get items => _items;

  double get totalAmount =>
      _items.where((i) => i.selected).fold(0, (sum, item) => sum + item.subtotal);

  List<CartItem> get selectedItems => _items.where((i) => i.selected).toList();

  void addItem(String productId, String name, double price, String imageUrl) {
    final existing = _items.indexWhere((i) => i.productId == productId);
    if (existing >= 0) {
      _items[existing].quantity++;
    } else {
      _items.add(CartItem(
        productId: productId,
        name: name,
        price: price,
        imageUrl: imageUrl,
      ));
    }
    notifyListeners();
  }

  void toggleSelected(String productId) {
    final item = _items.firstWhere((i) => i.productId == productId);
    item.selected = !item.selected;
    notifyListeners();
  }

  void removeItem(String productId) {
    _items.removeWhere((i) => i.productId == productId);
    notifyListeners();
  }

  void increaseQuantity(String productId) {
    final item = _items.firstWhere((i) => i.productId == productId);
    item.quantity++;
    notifyListeners();
  }

  void decreaseQuantity(String productId) {
    final item = _items.firstWhere((i) => i.productId == productId);
    if (item.quantity > 1) {
      item.quantity--;
    } else {
      _items.removeWhere((i) => i.productId == productId);
    }
    notifyListeners();
  }

  void removeSelected() {
    _items.removeWhere((i) => i.selected);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}